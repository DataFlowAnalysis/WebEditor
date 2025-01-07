import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import {
    AbstractWord,
    AnyWord,
    AutoCompleteNode,
    AutoCompleteTree,
    ConstantWord,
    NegatableWord,
    WordCompletion,
} from "./AutoCompletion";
import { LabelTypeRegistry } from "../labels/labelTypeRegistry";

export const DSL_LANGUAGE_ID = "constraint-dsl";

export class MonacoEditorConstraintDslCompletionProvider implements monaco.languages.CompletionItemProvider {
    constructor(private tree: AutoCompleteTree) {}

    triggerCharacters = [".", "(", " ", ","];

    provideCompletionItems(
        model: monaco.editor.ITextModel,
        position: monaco.Position,
    ): monaco.languages.ProviderResult<monaco.languages.CompletionList> {
        this.tree.setContent(model.getLineContent(position.lineNumber).substring(0, position.column - 1));
        const r = this.tree.getCompletion();
        return {
            suggestions: r,
        };
    }
}

export const constraintDslLanguageMonarchDefinition: monaco.languages.IMonarchLanguage = {
    keywords: ["data", "node", "neverFlows", "to", "where"],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    tokenizer: {
        root: [
            // keywords and identifiers
            [
                /[a-zA-Z_\|$][\w$]*/,
                {
                    cases: {
                        "@keywords": "keyword",
                        "@default": "identifier",
                    },
                },
            ],

            // whitespace and comments
            [/[ \t\r\n]+/, "white"],

            // delimiters and operators
            [/[()]/, "@brackets"],
            [
                /@symbols/,
                {
                    cases: {
                        "@default": "",
                    },
                },
            ],
        ],
    },
};

export namespace TreeBuilder {
    export function buildTree(labelTypeRegistry: LabelTypeRegistry): AutoCompleteNode[] {
        const conditions = getConditionalSelectors();
        const conditionalSelector: AutoCompleteNode = {
            word: new ConstantWord("where"),
            children: conditions,
        };

        const destinationSelectors = getAbstractSelectors(labelTypeRegistry);
        destinationSelectors.forEach((destinationSelector) => {
            getLeaves(destinationSelector).forEach((n) => {
                n.canBeFinal = true;
                n.children.push(conditionalSelector);
            });
        });
        const nodeDestinationSelector: AutoCompleteNode = {
            word: new ConstantWord("node"),
            children: destinationSelectors,
        };

        const neverFlows: AutoCompleteNode = {
            word: new ConstantWord("neverFlows"),
            children: [nodeDestinationSelector, conditionalSelector],
            canBeFinal: true,
        };

        const dataSourceSelector: AutoCompleteNode = {
            word: new ConstantWord("data"),
            children: [],
        };

        const nodeSelectors = getAbstractSelectors(labelTypeRegistry);
        nodeSelectors.forEach((nodeSelector) => {
            getLeaves(nodeSelector).forEach((n) => {
                n.children.push(dataSourceSelector);
                n.children.push(neverFlows);
            });
        });
        const nodeSourceSelector: AutoCompleteNode = {
            word: new ConstantWord("node"),
            children: nodeSelectors,
        };

        const dataSelectors = getAbstractSelectors(labelTypeRegistry);
        dataSelectors.forEach((dataSelector) => {
            getLeaves(dataSelector).forEach((n) => {
                n.children.push(nodeSourceSelector);
                n.children.push(neverFlows);
            });
        });
        dataSourceSelector.children = dataSelectors;

        return [nodeSourceSelector, dataSourceSelector];
    }

    function getLeaves(node: AutoCompleteNode): AutoCompleteNode[] {
        if (node.children.length == 0) {
            return [node];
        }
        let result: AutoCompleteNode[] = [];
        for (const n of node.children) {
            result = result.concat(getLeaves(n));
        }
        return result;
    }

    function getAbstractSelectors(labelTypeRegistry: LabelTypeRegistry): AutoCompleteNode[] {
        const vertexTypeSelector: AutoCompleteNode = {
            word: new ConstantWord("type"),
            children: [
                {
                    word: new NegatableWord(new AnyWord()),
                    children: [],
                },
            ],
        };
        const vertexCharacteristicsSelector = {
            word: new NegatableWord(new CharacteristicSelectorDate(labelTypeRegistry)),
            children: [],
        };
        // Equal to vertexCharacteristicsSelector?
        /*const dataCharacteristicSelector = {
            word: new NegatableWord(new AnyWord()),
            children: [],
        };*/
        const dataCharacteristicListSelector = {
            word: new NegatableWord(new CharacteristicSelectorDataList(labelTypeRegistry)),
            children: [],
        };
        const variableNameSelector = {
            word: new ConstantWord("named"),
            children: [
                {
                    word: new AnyWord(),
                    children: [],
                },
            ],
        };
        return [
            vertexTypeSelector,
            vertexCharacteristicsSelector,
            //dataCharacteristicSelector,
            dataCharacteristicListSelector,
            variableNameSelector,
        ];
    }

    function getConditionalSelectors(): AutoCompleteNode[] {
        const variableConditionalSelector: AutoCompleteNode = {
            word: new ConstantWord("present"),
            children: [
                {
                    word: new NegatableWord(new ConstraintVariableReference()),
                    children: [],
                },
            ],
        };

        const emptySetOperationSelector: AutoCompleteNode = {
            word: new ConstantWord("empty"),
            children: [
                {
                    word: new IntersectionWord(),
                    children: [],
                },
            ],
        };

        return [variableConditionalSelector, emptySetOperationSelector];
    }

    class IntersectionWord implements AbstractWord {
        private constraintVariableReference: ConstraintVariableReference;

        constructor() {
            this.constraintVariableReference = new ConstraintVariableReference();
        }

        completionOptions(word: string): WordCompletion[] {
            if (!word.startsWith("intersection(")) {
                if (!"intersection(".includes(word)) {
                    return [];
                }
                return [
                    {
                        insertText: "intersection($0)",
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        kind: monaco.languages.CompletionItemKind.Snippet,
                    },
                ];
            }
            return [];
        }
        verifyWord(word: string): boolean {
            const match = /intersection\((.*),(.*)\)/.exec(word);
            if (!match) {
                return false;
            }
            return (
                this.constraintVariableReference.verifyWord(match[1]) &&
                this.constraintVariableReference.verifyWord(match[2])
            );
        }
    }

    class ConstraintVariableReference extends AnyWord {}

    class CharacteristicSelectorDate implements AbstractWord {
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
                console.log(type?.values, parts);
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
                    kind: monaco.languages.CompletionItemKind.Enum,
                    startOffset: parts[0].length + 1,
                });
                return possibleValues;
            }

            return [];
        }

        verifyWord(word: string): boolean {
            const parts = word.split(".");

            if (parts.length > 2) {
                return false;
            }
            if (parts.length < 2) {
                return false;
            }

            const type = this.labelTypeRegistry.getLabelTypes().find((l) => l.name === parts[0]);
            if (!type) {
                return false;
            }

            if (parts[1].startsWith("$") && parts[1].length >= 2) {
                return true;
            }

            const label = type.values.find((l) => l.text === parts[1]);
            if (!label) {
                return false;
            }

            return true;
        }
    }

    class CharacteristicSelectorDataList implements AbstractWord {
        private characteristicSelectorData: CharacteristicSelectorDate;

        constructor(labelTypeRegistry: LabelTypeRegistry) {
            this.characteristicSelectorData = new CharacteristicSelectorDate(labelTypeRegistry);
        }

        completionOptions(word: string): WordCompletion[] {
            const parts = word.split(",");
            const last = parts[parts.length - 1];

            return this.characteristicSelectorData.completionOptions(last);
        }
        verifyWord(word: string): boolean {
            const parts = word.split(",");
            for (let i = 0; i < parts.length; i++) {
                if (!this.characteristicSelectorData.verifyWord(parts[i])) {
                    return false;
                }
            }

            return true;
        }
    }
}
