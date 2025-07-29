import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import {
    AbstractWord,
    AutoCompleteNode,
    AutoCompleteTree,
    ConstantWord,
    WordCompletion,
} from "../constraintMenu/AutoCompletion";
import { SModelElementImpl, SModelRootImpl, SParentElementImpl, SPortImpl } from "sprotty";
import { LabelTypeRegistry } from "../labels/labelTypeRegistry";
import { DfdNodeImpl } from "./nodes";

export class MonacoEditorAssignmentLanguageCompletionProvider implements monaco.languages.CompletionItemProvider {
    constructor(private tree: AutoCompleteTree) {}

    triggerCharacters = [".", ";", " ", ",", "("];

    provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
    ): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
        const allLines = model.getLinesContent();
        const includedLines: string[] = [];
        for (let i = 0; i < position.lineNumber - 1; i++) {
            includedLines.push(allLines[i]);
        }
        const currentLine = allLines[position.lineNumber - 1].substring(0, position.column - 1);
        includedLines.push(currentLine);

        const r = this.tree.getCompletion(includedLines);
        return {
            suggestions: r,
        };
    }
}

const startOfLineKeywords = ["forward", "assign", "set", "unset"];
const statementKeywords = [...startOfLineKeywords, "if", "from"];
const constantsKeywords = ["TRUE", "FALSE"];
export const assignemntLanguageMonarchDefinition: monaco.languages.IMonarchLanguage = {
    keywords: [...statementKeywords, ...constantsKeywords],

    operators: ["=", "||", "&&", "!"],

    symbols: /[=><!~?:&|+\-*/^%]+/,

    tokenizer: {
        root: [
            // keywords and identifiers
            [
                /[a-zA-Z_|$][\w$]*/,
                {
                    cases: {
                        "@keywords": "keyword",
                        "@default": "identifier",
                    },
                },
            ],

            // whitespace and comments
            [/[ \t\r\n]+/, "white"],
            [/\/\/.*$/, "comment"],
            [/#.*$/, "comment"],

            [
                /@symbols/,
                {
                    cases: {
                        "@operators": "operator",
                        "@default": "",
                    },
                },
            ],
        ],
    },
};

interface ReplaceableAbstractWord extends AbstractWord {
    replaceWord: (text: string, old: string, replacement: string) => string;
}

type WordOrReplacableWord = ReplaceableAbstractWord | AbstractWord;

export class ReplaceAutoCompleteTree extends AutoCompleteTree {
    constructor(protected roots: AutoCompleteNode<WordOrReplacableWord>[]) {
        super(roots);
    }
}

export namespace TreeBuilder {
    export function buildTree(
        model: SModelRootImpl,
        labelTypeRegistry: LabelTypeRegistry,
    ): AutoCompleteNode<WordOrReplacableWord>[] {
        return [
            buildSetOrUnsetStatement(labelTypeRegistry, "set"),
            buildSetOrUnsetStatement(labelTypeRegistry, "unset"),
            buildForwardStatement(model),
            buildAssignStatement(labelTypeRegistry, model),
        ];
    }

    function buildSetOrUnsetStatement(
        labelTypeRegistry: LabelTypeRegistry,
        keyword: string,
    ): AutoCompleteNode<WordOrReplacableWord> {
        const labelNode: AutoCompleteNode = {
            word: new LabelListWord(labelTypeRegistry),
            children: [],
        };
        return {
            word: new ConstantWord(keyword),
            children: [labelNode],
        };
    }

    function buildForwardStatement(model: SModelRootImpl) {
        const inputNode: AutoCompleteNode = {
            word: new InputListWord(model),
            children: [],
        };
        return {
            word: new ConstantWord("forward"),
            children: [inputNode],
        };
    }

    function buildAssignStatement(
        labelTypeRegistry: LabelTypeRegistry,
        model: SModelRootImpl,
    ): AutoCompleteNode<WordOrReplacableWord> {
        const fromNode: AutoCompleteNode = {
            word: new ConstantWord("from"),
            children: [
                {
                    word: new InputWord(model),
                    children: [],
                },
            ],
        };
        const ifNode: AutoCompleteNode = {
            word: new ConstantWord("if"),
            children: buildCondition(model, labelTypeRegistry, fromNode),
        };
        return {
            word: new ConstantWord("assign"),
            children: [
                {
                    word: new LabelWord(labelTypeRegistry),
                    children: [ifNode],
                },
            ],
        };
    }

    function buildCondition(model: SModelRootImpl, labelTypeRegistry: LabelTypeRegistry, nextNode: AutoCompleteNode) {
        const connectors: AutoCompleteNode[] = ["&&", "||"].map((o) => ({
            word: new ConstantWord(o),
            children: [],
        }));

        const expressors: AutoCompleteNode[] = [
            new ConstantWord("TRUE"),
            new ConstantWord("FALSE"),
            new InputLabelWord(model, labelTypeRegistry),
        ].map((e) => ({
            word: e,
            children: [...connectors, nextNode],
            canBeFinal: true,
        }));

        connectors.forEach((c) => {
            c.children = expressors;
        });
        return expressors;
    }
}

abstract class InputAwareWord {
    constructor(private model: SModelRootImpl) {}

    protected getAvailableInputs(): string[] {
        const selectedPorts = this.getSelectedPorts(this.model);
        if (selectedPorts.length === 0) {
            return [];
        }
        return selectedPorts.flatMap((port) => {
            const parent = port.parent;
            if (!(parent instanceof DfdNodeImpl)) {
                return [];
            }
            return parent.getAvailableInputs().filter((input) => input !== undefined) as string[];
        });
    }

    private getSelectedPorts(node: SModelElementImpl): SPortImpl[] {
        if (node instanceof SPortImpl && node.selected) {
            return [node];
        }
        if (node instanceof SParentElementImpl) {
            return node.children.flatMap((child) => this.getSelectedPorts(child));
        }
        return [];
    }
}

class LabelWord implements ReplaceableAbstractWord {
    constructor(private readonly labelTypeRegistry: LabelTypeRegistry) {}

    completionOptions(word: string): WordCompletion[] {
        const parts = word.split(".");

        if (parts.length == 1) {
            return this.labelTypeRegistry.getLabelTypes().map((l) => ({
                insertText: l.name,
                kind: monaco.languages.CompletionItemKind.Class,
            }));
        } else if (parts.length == 2) {
            const type = this.labelTypeRegistry.getLabelTypes().find((l) => l.name === parts[0]);
            if (!type) {
                return [];
            }

            const possibleValues: WordCompletion[] = type.values.map((l) => ({
                insertText: l.text,
                kind: monaco.languages.CompletionItemKind.Enum,
                startOffset: parts[0].length + 1,
            }));
            possibleValues.push({
                insertText: "$" + type.name,
                kind: monaco.languages.CompletionItemKind.Variable,
                startOffset: parts[0].length + 1,
            });
            return possibleValues;
        }

        return [];
    }

    verifyWord(word: string): string[] {
        const parts = word.split(".");

        if (parts.length > 2) {
            return ["Expected at most 2 parts in characteristic selector"];
        }

        const type = this.labelTypeRegistry.getLabelTypes().find((l) => l.name === parts[0]);
        if (!type) {
            return ['Unknown label type "' + parts[0] + '"'];
        }

        if (parts.length < 2) {
            return ["Expected characteristic to have value"];
        }

        if (parts[1].startsWith("$") && parts[1].length >= 2) {
            return [];
        }

        const label = type.values.find((l) => l.text === parts[1]);
        if (!label) {
            return ['Unknown label value "' + parts[1] + '" for type "' + parts[0] + '"'];
        }

        return [];
    }

    replaceWord(text: string, old: string, replacement: string) {
        if (text == old) {
            return replacement;
        }
        return text;
    }
}

class LabelListWord implements ReplaceableAbstractWord {
    labelWord: LabelWord;

    constructor(labelTypeRegistry: LabelTypeRegistry) {
        this.labelWord = new LabelWord(labelTypeRegistry);
    }

    completionOptions(word: string): WordCompletion[] {
        const parts = word.split(",");
        const lastPart = parts[parts.length - 1];
        return this.labelWord.completionOptions(lastPart);
    }

    verifyWord(word: string): string[] {
        const parts = word.split(",");
        const errors: string[] = [];
        for (const part of parts) {
            errors.push(...this.labelWord.verifyWord(part));
        }
        return errors;
    }

    replaceWord(text: string, old: string, replacement: string) {
        const parts = text.split(",");
        const newParts = parts.map((part) => this.labelWord.replaceWord(part, old, replacement));
        return newParts.join(",");
    }
}

class InputWord extends InputAwareWord implements ReplaceableAbstractWord {
    completionOptions(): WordCompletion[] {
        return this.getAvailableInputs().map((input) => ({
            insertText: input,
            kind: monaco.languages.CompletionItemKind.Variable,
        }));
    }

    verifyWord(word: string): string[] {
        const availableInputs = this.getAvailableInputs();
        if (availableInputs.includes(word)) {
            return [];
        }
        return [`Unknown input "${word}"`];
    }

    replaceWord(text: string, old: string, replacement: string) {
        const availableInputs = this.getAvailableInputs();
        if (availableInputs.includes(old)) {
            return text.replace(old, replacement);
        }
        return text;
    }
}

class InputListWord implements ReplaceableAbstractWord {
    private inputWord: InputWord;
    constructor(model: SModelRootImpl) {
        this.inputWord = new InputWord(model);
    }

    completionOptions(): WordCompletion[] {
        return this.inputWord.completionOptions();
    }

    verifyWord(word: string): string[] {
        const parts = word.split(",");
        const errors: string[] = [];
        for (const part of parts) {
            errors.push(...this.inputWord.verifyWord(part));
        }
        return errors;
    }

    replaceWord(text: string, old: string, replacement: string) {
        const parts = text.split(",");
        const newParts = parts.map((part) => this.inputWord.replaceWord(part, old, replacement));
        return newParts.join(",");
    }
}

class InputLabelWord implements ReplaceableAbstractWord {
    private inputWord: InputWord;
    private labelWord: LabelWord;

    constructor(model: SModelRootImpl, labelTypeRegistry: LabelTypeRegistry) {
        this.inputWord = new InputWord(model);
        this.labelWord = new LabelWord(labelTypeRegistry);
    }

    completionOptions(word: string): WordCompletion[] {
        const parts = word.split(".");
        if (parts[1] === undefined) {
            return this.inputWord.completionOptions();
        } else if (parts.length === 2) {
            return this.labelWord.completionOptions(parts[1]).map((c) => ({
                ...c,
                insertText: parts[0] + "." + c.insertText,
            }));
        }
        return [];
    }

    verifyWord(word: string): string[] {
        const parts = this.getParts(word);
        const inputErrors = this.inputWord.verifyWord(parts[0]);
        if (inputErrors.length > 0) {
            return inputErrors;
        }
        if (parts[1] === undefined) {
            return ["Expected input and label separated by a dot"];
        }
        const labelErrors = this.labelWord.verifyWord(parts[1]);
        return [...inputErrors, ...labelErrors];
    }

    replaceWord(text: string, old: string, replacement: string) {
        const [input, label] = this.getParts(text);
        if (input === old) {
            return replacement + (label ? "." + label : "");
        } else if (label === old) {
            return input + "." + replacement;
        }
        return text;
    }

    private getParts(text: string): [string, string] | [string, undefined] {
        if (text.includes(".")) {
            const index = text.indexOf(".");
            const input = text.substring(0, index);
            const label = text.substring(index + 1);
            return [input, label];
        }
        return [text, undefined];
    }
}
