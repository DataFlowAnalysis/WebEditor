import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

export interface RequiredCompletionParts {
    kind: monaco.languages.CompletionItemKind;
    insertText: string;
    startOffset?: number;
}

export interface ValidationError {
    message: string;
    startColumn: number;
    endColumn: number;
}

export type WordCompletion = RequiredCompletionParts & Partial<monaco.languages.CompletionItem>;

export interface AbstractWord {
    completionOptions(word: string): WordCompletion[];

    /**
     *
     * @param word
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

    completionOptions(_: string): WordCompletion[] {
        return [
            {
                insertText: this.word,
                kind: monaco.languages.CompletionItemKind.Keyword,
            },
        ];
    }
}

export class AnyWord implements AbstractWord {
    completionOptions(_: string): WordCompletion[] {
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
    private content: string[];
    /** value matches the start column of the value at the same index in content */
    private startColumns: number[];
    private length: number;

    constructor(private roots: AutoCompleteNode[]) {
        this.content = [];
        this.startColumns = [];
        this.length = 0;
    }

    public setContent(line: string) {
        if (line.length == 0) {
            this.content = [];
            this.length = 0;
            return;
        }
        this.content = line.split(" ");
        this.startColumns = this.content.map((_) => 0);
        for (let i = 1; i < this.content.length; i++) {
            this.startColumns[i] = this.startColumns[i - 1] + this.content[i - 1].length + 1;
        }
        this.length = line.length;
    }

    public verify(): ValidationError[] {
        return this.verifyNode(this.roots, 0, false);
    }

    private verifyNode(nodes: AutoCompleteNode[], index: number, comesFromFinal: boolean): ValidationError[] {
        if (index >= this.content.length) {
            if (nodes.length == 0 || comesFromFinal) {
                return [];
            }
        }

        let foundErrors: ValidationError[] = [];
        for (const n of nodes) {
            const v = n.word.verifyWord(this.content[index]);
            if (v.length > 0) {
                foundErrors.push({
                    message: v[0],
                    startColumn: this.startColumns[index],
                    endColumn: this.startColumns[index] + this.content[index].length,
                });
                continue;
            }

            const childResult = this.verifyNode(n.children, index + 1, n.canBeFinal || false);
            if (childResult) {
                return [];
            }
        }

        return foundErrors;
    }

    public getCompletion(): monaco.languages.CompletionItem[] {
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
                result = result.concat(node.word.completionOptions(this.content[index]));
            }
            return result;
        }
        for (const n of nodes) {
            if (!n.word.verifyWord(this.content[index])) {
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
        const wordStart = this.content.length == 0 ? 1 : this.length - this.content[this.content.length - 1].length + 1;
        return {
            insertText: comp.insertText,
            kind: comp.kind,
            label: comp.label ?? comp.insertText,
            insertTextRules: comp.insertTextRules,
            range: new monaco.Range(1, wordStart + (comp.startOffset ?? 0), 1, this.length + 1),
        };
    }
}

export interface AutoCompleteNode {
    word: AbstractWord;
    children: AutoCompleteNode[];
    canBeFinal?: boolean;
    viewAsLeaf?: boolean;
}
