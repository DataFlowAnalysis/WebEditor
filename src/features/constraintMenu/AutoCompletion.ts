import * as monaco from "monaco-editor/esm/vs/editor/editor.api";

interface WordCompletion {
    kind: monaco.languages.CompletionItemKind;
    insertText: string;
}

interface AbstractWord {
    completionOptions(word: string): WordCompletion[];

    verifyWord(word: string): boolean;
}

class ConstantWord implements AbstractWord {
    constructor(protected word: string) {}

    verifyWord(word: string): boolean {
        return word == this.word;
    }

    completionOptions(part: string): WordCompletion[] {
        console.log(this.word, part, this.word.startsWith(part));
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

class EmptyWord implements AbstractWord {
    completionOptions(word: string): WordCompletion[] {
        return [];
    }
    verifyWord(word: string): boolean {
        return true;
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
        console.log(this.content);
    }

    public verify(): boolean {
        return this.verifyNode(this.roots, 0);
    }

    private verifyNode(nodes: AutoCompleteNode[], index: number): boolean {
        if (index >= this.content.length) {
            return nodes.length == 0;
        }

        for (const n of nodes) {
            if (!n.word.verifyWord(this.content[index])) {
                continue;
            }

            const childResult = this.verifyNode(n.children, index + 1);
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

interface AutoCompleteNode {
    word: AbstractWord;
    children: AutoCompleteNode[];
}

export namespace TreeBuilder {
    export function buildTree(): AutoCompleteNode[] {
        const destinationSelector: AutoCompleteNode = {
            word: new ConstantWord("to"),
            children: [
                {
                    word: new ConstantWord("placeholder"),
                    children: [],
                },
            ],
        };

        const neverFlows: AutoCompleteNode = {
            word: new ConstantWord("neverFlows"),
            children: [destinationSelector],
        };

        const nodeSourceSelector: AutoCompleteNode = {
            word: new ConstantWord("node"),
            children: [neverFlows],
        };
        const dataSourceSelector: AutoCompleteNode = {
            word: new ConstantWord("data"),
            children: [neverFlows, nodeSourceSelector],
        };
        nodeSourceSelector.children.push(dataSourceSelector);

        return [nodeSourceSelector, dataSourceSelector];
    }
}
