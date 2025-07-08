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
    private content: Token[];

    constructor(private roots: AutoCompleteNode[]) {
        this.content = [];
    }

    /**
     * Sets the content of the tree for the next analyzing cycle
     */
    private setContent(text: string) {
        if (!text) {
            text = "";
        }
        if (text.length == 0) {
            this.content = [];
            return;
        }

        let currentToken = "";
        let currentLine = 1;
        let currentColumn = 0;
        this.content = [];
        let index = 0;
        while (index < text.length) {
            const char = text[index];
            if (char === "\n") {
                if (currentToken.length > 0) {
                    this.content.push({
                        text: currentToken,
                        line: currentLine,
                        column: currentColumn - currentToken.length + 1,
                    });
                }
                currentToken = "";
                currentLine++;
                currentColumn = 1;
            } else if (char === " " || char === "\t") {
                if (currentToken.length > 0) {
                    this.content.push({
                        text: currentToken,
                        line: currentLine,
                        column: currentColumn - currentToken.length + 1,
                    });
                }
                currentToken = "";
                currentColumn += 1;
            } else {
                currentToken += char;
                currentColumn += 1;
            }
            index++;
        }
        if (currentToken.length > 0) {
            this.content.push({
                text: currentToken,
                line: currentLine,
                column: currentColumn - currentToken.length + 1,
            });
        }
        this.content = this.content.map((c) => ({ ...c, text: c.text.trim() })).filter((c) => c.text.length > 0);
    }

    /**
     * Checks the set content for errors
     * @returns An array of errors. An empty array means that the content is valid
     */
    public verify(line: string): ValidationError[] {
        this.setContent(line);
        return this.verifyNode(this.roots, 0, false);
    }

    private verifyNode(nodes: AutoCompleteNode[], index: number, comesFromFinal: boolean): ValidationError[] {
        if (comesFromFinal && this.content[index].column == 0) {
            const checkStart = this.verifyNode(this.roots, index, true);
            if (checkStart.length > 0) {
                return checkStart;
            }
        }
        if (index >= this.content.length) {
            if (nodes.length == 0 || comesFromFinal) {
                return [];
            } else {
                return [
                    {
                        message: "Unexpected end of line",
                        line: this.content[index - 1].line,
                        startColumn: this.content[index - 1].column + this.content[index - 1].text.length - 1,
                        endColumn: this.content[index - 1].column + this.content[index - 1].text.length,
                    },
                ];
            }
        }

        const foundErrors: ValidationError[] = [];
        let childErrors: ValidationError[] = [];
        for (const n of nodes) {
            const v = n.word.verifyWord(this.content[index].text);
            if (v.length > 0) {
                foundErrors.push({
                    message: v[0],
                    startColumn: this.content[index].column,
                    endColumn: this.content[index].column + this.content[index].text.length,
                    line: this.content[index].line,
                });
                continue;
            }

            const childResult = this.verifyNode(n.children, index + 1, n.canBeFinal || false);
            if (childResult.length == 0) {
                return [];
            } else {
                childErrors = childErrors.concat(childResult);
            }
        }
        if (childErrors.length > 0) {
            return childErrors;
        }
        return foundErrors;
    }

    /**
     * Calculates the completion options for the current content
     */
    public getCompletion(line: string): monaco.languages.CompletionItem[] {
        this.setContent(line);
        let result: WordCompletion[] = [];
        if (this.content.length == 0) {
            for (const r of this.roots) {
                result = result.concat(r.word.completionOptions(""));
            }
        } else {
            result = this.completeNode(this.roots, 0);
        }
        return this.transformResults(result);
    }

    private completeNode(nodes: AutoCompleteNode[], index: number): WordCompletion[] {
        let result: WordCompletion[] = [];
        if (index == this.content.length - 1) {
            for (const node of nodes) {
                result = result.concat(node.word.completionOptions(this.content[index].text));
            }
            return result;
        }
        for (const n of nodes) {
            if (!n.word.verifyWord(this.content[index].text)) {
                continue;
            }
            result = result.concat(this.completeNode(n.children, index + 1));
        }
        return result;
    }

    private transformResults(comp: WordCompletion[]): monaco.languages.CompletionItem[] {
        const result: monaco.languages.CompletionItem[] = [];
        const filtered = comp.filter(
            (c, idx) => comp.findIndex((c2) => c2.insertText === c.insertText && c2.kind === c.kind) === idx,
        );
        for (const c of filtered) {
            const r = this.transformResult(c);
            result.push(r);
        }
        return result;
    }

    private transformResult(comp: WordCompletion): monaco.languages.CompletionItem {
        const wordStart = this.content.length == 0 ? 1 : this.content[this.content.length - 1].column - 1;
        const lineNumber = this.content.length == 0 ? 1 : this.content[this.content.length - 1].line;
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

export interface AutoCompleteNode {
    word: AbstractWord;
    children: AutoCompleteNode[];
    canBeFinal?: boolean;
    viewAsLeaf?: boolean;
}
