import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

interface WordCompletion {
    kind: monaco.languages.CompletionItemKind;
    insertText: string;
}

interface AbstractWord {
    completionOptions(word: string): WordCompletion[];

    verifyWord(word: string): boolean;
}

export class ConstantWord implements AbstractWord {
    constructor(protected word: string) {}

    verifyWord(word: string): boolean {
        return word == this.word;
    }

    completionOptions(part: string): WordCompletion[] {
        if (this.word.startsWith(part)) {
            return [
                {
                    insertText: this.word,
                    kind: monaco.languages.CompletionItemKind.Keyword,
                },
            ];
        }
        return [];
    }
}

export class AnyWord implements AbstractWord {
    completionOptions(_: string): WordCompletion[] {
        return [];
    }
    verifyWord(_: string): boolean {
        return true;
    }
}

export class NegatableWord implements AbstractWord {
    constructor(protected word: AbstractWord) {}

    verifyWord(word: string): boolean {
        if (word.startsWith("!")) {
            return this.word.verifyWord(word.substring(1));
        }
        return this.word.verifyWord(word);
    }

    completionOptions(part: string): WordCompletion[] {
        if (part.startsWith("!")) {
            return this.word.completionOptions(part.substring(1));
        }
        return this.word.completionOptions(part);
    }
}

export class AutoCompleteTree {
    private content: string[];
    private length: number;

    constructor(private roots: AutoCompleteNode[]) {
        this.content = [];
        this.length = 0;
    }

    public setContent(line: string) {
        if (line.length == 0) {
            this.content = [];
            this.length = 0;
            return;
        }
        this.content = line.split(" ");
        this.length = line.length;
    }

    public verify(): boolean {
        return this.verifyNode(this.roots, 0, false);
    }

    private verifyNode(nodes: AutoCompleteNode[], index: number, comesFromFinal: boolean): boolean {
        if (index >= this.content.length) {
            return nodes.length == 0 || comesFromFinal;
        }

        for (const n of nodes) {
            if (!n.word.verifyWord(this.content[index])) {
                continue;
            }

            const childResult = this.verifyNode(n.children, index + 1, n.canBeFinal || false);
            if (childResult) {
                return true;
            }
        }

        return false;
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
        for (const c of comp) {
            const r = this.transformResult(c);
            result.push(r);
        }
        return result;
    }

    private transformResult(comp: WordCompletion): monaco.languages.CompletionItem {
        const wordStart = this.content.length == 0 ? 1 : this.length - this.content[this.content.length - 1].length + 1;
        return {
            ...comp,
            label: comp.insertText,
            range: new monaco.Range(1, wordStart, 1, this.length + 1),
        };
    }
}

export interface AutoCompleteNode {
    word: AbstractWord;
    children: AutoCompleteNode[];
    canBeFinal?: boolean;
}
