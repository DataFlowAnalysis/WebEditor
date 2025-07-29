import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

export interface RequiredCompletionParts {
    kind: monaco.languages.CompletionItemKind;
    insertText: string;
    startOffset?: number;
}

export interface ValidationError {
    message: string;
    line: number;
    startColumn: number;
    endColumn: number;
}

interface Token {
    text: string;
    line: number;
    column: number;
}

export type WordCompletion = RequiredCompletionParts & Partial<monaco.languages.CompletionItem>;

export interface AbstractWord {
    /**
     * Calculates the completion options for the given word
     * @param word Can be taken into account for returning completion options
     * @returns Array of completion options. Can contain all options from @link{monaco.languages.CompletionItem}
     */
    completionOptions(word: string): WordCompletion[];

    /**
     * Verifies if the given word is valid
     * An empty array means that the word is valid
     * The strings in the array are error messages
     * @param word The word to verify
     * @returns Array of all error messages
     */
    verifyWord(word: string): string[];
}

export class ConstantWord implements AbstractWord {
    constructor(protected word: string) {}

    verifyWord(word: string): string[] {
        if (word == this.word) {
            return [];
        } else {
            return [`Expected keyword "${this.word}"`];
        }
    }

    completionOptions(): WordCompletion[] {
        return [
            {
                insertText: this.word,
                kind: monaco.languages.CompletionItemKind.Keyword,
            },
        ];
    }
}

export class AnyWord implements AbstractWord {
    completionOptions(): WordCompletion[] {
        return [];
    }
    verifyWord(word: string): string[] {
        if (word.length > 0) {
            return [];
        } else {
            return ["Expected a word"];
        }
    }
}

export class NegatableWord implements AbstractWord {
    constructor(protected word: AbstractWord) {}

    verifyWord(word: string): string[] {
        if (word.startsWith("!")) {
            return this.word.verifyWord(word.substring(1));
        }
        return this.word.verifyWord(word);
    }

    completionOptions(part: string): WordCompletion[] {
        if (part.startsWith("!")) {
            const options = this.word.completionOptions(part.substring(1));
            return options.map((o) => ({
                ...o,
                startOffset: (o.startOffset ?? 0) + 1,
            }));
        }
        return this.word.completionOptions(part);
    }
}

export class AutoCompleteTree {
    constructor(protected roots: AutoCompleteNode<AbstractWord>[]) {}

    private tokenize(text: string[]): Token[] {
        if (!text || text.length == 0) {
            return [];
        }

        const tokens: Token[] = [];
        for (const [lineNumber, line] of text.entries()) {
            const lineTokens = line.split(/\s+/).filter((t) => t.length > 0);
            let column = 0;
            for (const token of lineTokens) {
                column = line.indexOf(token, column);
                tokens.push({
                    text: token,
                    line: lineNumber + 1,
                    column: column + 1,
                });
            }
        }

        return tokens;
    }

    /**
     * Checks the set content for errors
     * @returns An array of errors. An empty array means that the content is valid
     */
    public verify(lines: string[]): ValidationError[] {
        const tokens = this.tokenize(lines);
        return this.verifyNode(this.roots, tokens, 0, false, true);
    }

    private verifyNode(
        nodes: AutoCompleteNode[],
        tokens: Token[],
        index: number,
        comesFromFinal: boolean,
        skipStartCheck = false,
    ): ValidationError[] {
        if (index >= tokens.length) {
            if (nodes.length == 0 || comesFromFinal) {
                return [];
            } else {
                return [
                    {
                        message: "Unexpected end of line",
                        line: tokens[index - 1].line,
                        startColumn: tokens[index - 1].column + tokens[index - 1].text.length - 1,
                        endColumn: tokens[index - 1].column + tokens[index - 1].text.length,
                    },
                ];
            }
        }
        if (!skipStartCheck && tokens[index].column == 1) {
            const matchesAnyRoot = this.roots.some((r) => r.word.verifyWord(tokens[index].text).length === 0);
            if (matchesAnyRoot) {
                return this.verifyNode(this.roots, tokens, index, false, true);
            }
        }

        const foundErrors: ValidationError[] = [];
        let childErrors: ValidationError[] = [];
        for (const n of nodes) {
            const v = n.word.verifyWord(tokens[index].text);
            if (v.length > 0) {
                foundErrors.push({
                    message: v[0],
                    startColumn: tokens[index].column,
                    endColumn: tokens[index].column + tokens[index].text.length,
                    line: tokens[index].line,
                });
                continue;
            }

            const childResult = this.verifyNode(n.children, tokens, index + 1, n.canBeFinal || false);
            if (childResult.length == 0) {
                return [];
            } else {
                childErrors = childErrors.concat(childResult);
            }
        }
        if (childErrors.length > 0) {
            return deduplicateErrors(childErrors);
        }
        return deduplicateErrors(foundErrors);
    }

    /**
     * Calculates the completion options for the current content
     */
    public getCompletion(lines: string[]): monaco.languages.CompletionItem[] {
        const tokens = this.tokenize(lines);
        const endsWithWhitespace =
            (lines.length > 0 && lines[lines.length - 1].charAt(lines[lines.length - 1].length - 1).match(/\s/)) ||
            lines[lines.length - 1].length == 0;
        if (endsWithWhitespace) {
            tokens.push({
                text: "",
                line: lines.length,
                column: lines[lines.length - 1].length + 1,
            });
        }
        let result: WordCompletion[] = [];
        if (tokens.length == 0) {
            for (const r of this.roots) {
                result = result.concat(r.word.completionOptions(""));
            }
        } else {
            result = this.completeNode(this.roots, tokens, 0);
        }
        return this.transformResults(result, tokens);
    }

    private completeNode(
        nodes: AutoCompleteNode[],
        tokens: Token[],
        index: number,
        skipStartCheck = false,
    ): WordCompletion[] {
        // check for new start

        if (!skipStartCheck && tokens[index].column == 1) {
            const matchesAnyRoot = this.roots.some((n) => n.word.verifyWord(tokens[index].text).length === 0);
            if (matchesAnyRoot) {
                return this.completeNode(this.roots, tokens, index, true);
            }
        }

        let result: WordCompletion[] = [];
        if (index == tokens.length - 1) {
            for (const node of nodes) {
                result = result.concat(node.word.completionOptions(tokens[index].text));
            }
            return result;
        }
        for (const n of nodes) {
            if (n.word.verifyWord(tokens[index].text).length > 0) {
                continue;
            }
            result = result.concat(this.completeNode(n.children, tokens, index + 1));
        }
        return result;
    }

    private transformResults(comp: WordCompletion[], tokens: Token[]): monaco.languages.CompletionItem[] {
        const result: monaco.languages.CompletionItem[] = [];
        const filtered = comp.filter(
            (c, idx) => comp.findIndex((c2) => c2.insertText === c.insertText && c2.kind === c.kind) === idx,
        );
        for (const c of filtered) {
            const r = this.transformResult(c, tokens);
            result.push(r);
        }
        return result;
    }

    private transformResult(comp: WordCompletion, tokens: Token[]): monaco.languages.CompletionItem {
        const wordStart = tokens.length == 0 ? 1 : tokens[tokens.length - 1].column;
        const lineNumber = tokens.length == 0 ? 1 : tokens[tokens.length - 1].line;
        return {
            insertText: comp.insertText,
            kind: comp.kind,
            label: comp.label ?? comp.insertText,
            insertTextRules: comp.insertTextRules,
            range: new monaco.Range(
                lineNumber,
                wordStart + (comp.startOffset ?? 0),
                lineNumber,
                wordStart + (comp.startOffset ?? 0) + comp.insertText.length,
            ),
        };
    }
}

function deduplicateErrors(errors: ValidationError[]): ValidationError[] {
    const seen = new Set<string>();
    return errors.filter((error) => {
        const key = `${error.line}-${error.startColumn}-${error.endColumn}-${error.message}`;
        if (seen.has(key)) {
            return false;
        }
        seen.add(key);
        return true;
    });
}

export interface AutoCompleteNode<W extends AbstractWord = AbstractWord> {
    word: W;
    children: AutoCompleteNode<W>[];
    canBeFinal?: boolean;
    viewAsLeaf?: boolean;
}
