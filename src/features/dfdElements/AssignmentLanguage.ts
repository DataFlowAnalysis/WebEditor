import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import {
    AbstractWord,
    AutoCompleteNode,
    AutoCompleteTree,
    ConstantWord,
    Token,
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

interface ReplacementData {
    old: string;
    replacement: string;
    type: string;
}

interface ReplaceableAbstractWord extends AbstractWord {
    replaceWord(text: string, replacement: ReplacementData): string;
}

type WordOrReplacableWord = ReplaceableAbstractWord | AbstractWord;

export class ReplaceAutoCompleteTree extends AutoCompleteTree {
    constructor(protected roots: AutoCompleteNode<WordOrReplacableWord>[]) {
        super(roots);
    }

    public replace(lines: string[], replacement: ReplacementData): string[] {
        const tokens = this.tokenize(lines);
        const replaced = this.replaceToken(this.roots, tokens, 0, replacement);
        const newLines: string[] = [];
        let currentLine = "";
        for (let i = 0; i < tokens.length; i++) {
            const token = tokens[i];
            const newText = replaced[i];
            currentLine += newText;
            currentLine += token.whiteSpaceAfter || "";
            if (i == tokens.length - 1 || tokens[i + 1].line !== token.line) {
                newLines.push(currentLine);
                currentLine = "";
            }
        }
        return newLines;
    }

    private replaceToken(
        nodes: AutoCompleteNode<WordOrReplacableWord>[],
        tokens: Token[],
        index: number,
        replacement: ReplacementData,
        skipStartCheck = false,
    ): string[] {
        if (index >= tokens.length) {
            return [];
        }
        // check for new start
        if (!skipStartCheck && tokens[index].column == 1) {
            const matchesAnyRoot = this.roots.some((n) => n.word.verifyWord(tokens[index].text).length === 0);
            if (matchesAnyRoot) {
                return this.replaceToken(this.roots, tokens, index, replacement, true);
            }
        }
        let text = tokens[index].text;
        for (const n of nodes) {
            if ((n.word as ReplaceableAbstractWord).replaceWord) {
                text = (n.word as ReplaceableAbstractWord).replaceWord(text, replacement);
            }
        }
        return [
            text,
            ...this.replaceToken(
                nodes.flatMap((n) => n.children),
                tokens,
                index + 1,
                replacement,
            ),
        ];
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
                    word: new InputListWord(model),
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

            return type.values.map((l) => ({
                insertText: l.text,
                kind: monaco.languages.CompletionItemKind.Enum,
                startOffset: parts[0].length + 1,
            }));
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

    replaceWord(text: string, replacement: ReplacementData) {
        if (replacement.type == "Label" && text == replacement.old) {
            return replacement.replacement;
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
        const prefixLength = parts.slice(0, -1).reduce((acc, part) => acc + part.length + 1, 0); // +1 for the commas
        return this.labelWord.completionOptions(lastPart).map((c) => ({
            ...c,
            startOffset: prefixLength + (c.startOffset ?? 0),
        }));
    }

    verifyWord(word: string): string[] {
        const parts = word.split(",");
        const errors: string[] = [];
        for (const part of parts) {
            errors.push(...this.labelWord.verifyWord(part));
        }
        return errors;
    }

    replaceWord(text: string, replacement: ReplacementData) {
        const parts = text.split(",");
        const newParts = parts.map((part) => this.labelWord.replaceWord(part, replacement));
        return newParts.join(",");
    }
}

class InputWord extends InputAwareWord implements ReplaceableAbstractWord {
    completionOptions(): WordCompletion[] {
        const inputs = this.getAvailableInputs();
        return inputs.map((input) => ({
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

    replaceWord(text: string, replacement: ReplacementData) {
        if (replacement.type == "Input" && text == replacement.old) {
            return replacement.replacement;
        }
        return text;
    }
}

class InputListWord implements ReplaceableAbstractWord {
    private inputWord: InputWord;
    constructor(model: SModelRootImpl) {
        this.inputWord = new InputWord(model);
    }

    completionOptions(word: string): WordCompletion[] {
        const parts = word.split(",");
        // remove last one as we are completing that one
        if (parts.length > 1) {
            parts.pop();
        }
        const startOffset = parts.reduce((acc, part) => acc + part.length + 1, 0); // +1 for the commas
        return this.inputWord
            .completionOptions()
            .filter((c) => !parts.includes(c.insertText))
            .map((c) => ({
                ...c,
                startOffset: startOffset + (c.startOffset ?? 0),
            }));
    }

    verifyWord(word: string): string[] {
        const parts = word.split(",");
        const errors: string[] = [];
        for (const part of parts) {
            errors.push(...this.inputWord.verifyWord(part));
        }
        return errors;
    }

    replaceWord(text: string, replacement: ReplacementData) {
        const parts = text.split(",");
        const newParts = parts.map((part) => this.inputWord.replaceWord(part, replacement));
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
        const parts = this.getParts(word);
        if (parts[1] === undefined) {
            return this.inputWord.completionOptions().map((c) => ({
                ...c,
                insertText: c.insertText,
            }));
        } else if (parts.length >= 2) {
            return this.labelWord.completionOptions(parts[1]).map((c) => ({
                ...c,
                insertText: c.insertText,
                startOffset: (c.startOffset ?? 0) + parts[0].length + 1, // +1 for the dot
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

    replaceWord(text: string, replacement: ReplacementData) {
        const [input, label] = this.getParts(text);
        if (replacement.type == "Input" && input === replacement.old) {
            return replacement.replacement + (label ? "." + label : "");
        } else if (replacement.type == "Label" && label === replacement.old) {
            return input + "." + replacement.replacement;
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
