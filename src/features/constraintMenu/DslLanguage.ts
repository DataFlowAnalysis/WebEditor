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
import { SModelRoot } from "sprotty-protocol";
import { ArrowEdge } from "../dfdElements/edges";
import { LocalModelSource } from "sprotty";

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
    keywords: ["data", "node", "neverFlows", "to", "where", "named", "present", "empty", "type"],

    symbols: /[=><!~?:&|+\-*\/\^%]+/,

    brackets: [
        {
            open: "(",
            close: ")",
            token: "delimiter.parenthesis",
        },
    ],

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
    export function buildTree(modelSource: LocalModelSource, labelTypeRegistry: LabelTypeRegistry): AutoCompleteNode[] {
        const conditions = getConditionalSelectors();
        const conditionalSelector: AutoCompleteNode = {
            word: new ConstantWord("where"),
            children: conditions,
        };

        const destinationSelectors = getAbstractSelectors(modelSource, labelTypeRegistry);
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

        const nodeSelectors = getAbstractSelectors(modelSource, labelTypeRegistry);
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

        const dataSelectors = getAbstractSelectors(modelSource, labelTypeRegistry);
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

    function getAbstractSelectors(
        modelSource: LocalModelSource,
        labelTypeRegistry: LabelTypeRegistry,
    ): AutoCompleteNode[] {
        const vertexTypeSelector: AutoCompleteNode = {
            word: new ConstantWord("type"),
            children: [
                new NegatableWord(new ConstantWord("EXTERNAL")),
                new NegatableWord(new ConstantWord("PROCESS")),
                new NegatableWord(new ConstantWord("STORE")),
            ].map((w) => ({ word: w, children: [] })),
        };
        const characteristicsSelector = {
            word: new NegatableWord(new CharacteristicSelectorData(labelTypeRegistry)),
            children: [],
        };
        const dataCharacteristicListSelector = {
            word: new NegatableWord(new CharacteristicSelectorDataList(labelTypeRegistry)),
            children: [],
        };
        const variableNameSelector = {
            word: new ConstantWord("named"),
            children: [
                {
                    word: new VariableName(modelSource),
                    children: [],
                },
            ],
        };
        return [vertexTypeSelector, characteristicsSelector, dataCharacteristicListSelector, variableNameSelector];
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
                        label: "intersection()",
                        insertText: "intersection($0)",
                        insertTextRules: monaco.languages.CompletionItemInsertTextRule.InsertAsSnippet,
                        kind: monaco.languages.CompletionItemKind.Function,
                    },
                ];
            }
            const attributes = word.substring("intersection(".length, word.length - 1).split(",");
            if (attributes.length > 2) {
                return [];
            }
            return this.constraintVariableReference.completionOptions(attributes[attributes.length - 1]);
        }
        verifyWord(word: string): string[] {
            if (!word.startsWith("intersection(")) {
                return ['Expected keyword "intersection"'];
            }
            const attributes = word.substring("intersection(".length, word.length - 1).split(",");
            if (attributes.length > 2) {
                return ['Expected at most 2 attributes in "intersection"'];
            }
            return attributes.flatMap((a) => this.constraintVariableReference.verifyWord(a));
        }
    }

    class ConstraintVariableReference extends AnyWord {}

    class CharacteristicSelectorData implements AbstractWord {
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
    }

    class VariableName implements AbstractWord {
        constructor(private readonly modelSource: LocalModelSource) {}

        completionOptions(_: string): WordCompletion[] {
            return this.getAllPortNames().map((n) => ({
                insertText: n,
                kind: monaco.languages.CompletionItemKind.Variable,
            }));
        }
        verifyWord(word: string): string[] {
            if (this.getAllPortNames().includes(word)) {
                return [];
            }
            return ['Unknown variable name "' + word + '"'];
        }

        private getAllPortNames(): string[] {
            const portEdgeNameMap: Map<string, string[]> = new Map();
            const graph = this.modelSource.model as SModelRoot;
            if (graph.children === undefined) {
                return [];
            }
            for (const element of graph.children) {
                const edge = element as ArrowEdge;
                if (edge.text !== undefined && edge.targetId !== undefined) {
                    const edgeName = edge.text!;
                    const target = edge.targetId;
                    if (portEdgeNameMap.has(target)) {
                        portEdgeNameMap.get(target)?.push(edgeName);
                    } else {
                        portEdgeNameMap.set(target, [edgeName]);
                    }
                }
            }

            return Array.from(portEdgeNameMap.keys()).map((key) => portEdgeNameMap.get(key)!.sort().join("|"));
        }
    }

    class CharacteristicSelectorDataList implements AbstractWord {
        private characteristicSelectorData: CharacteristicSelectorData;

        constructor(labelTypeRegistry: LabelTypeRegistry) {
            this.characteristicSelectorData = new CharacteristicSelectorData(labelTypeRegistry);
        }

        completionOptions(word: string): WordCompletion[] {
            const parts = word.split(",");
            const last = parts[parts.length - 1];

            return this.characteristicSelectorData.completionOptions(last);
        }
        verifyWord(word: string): string[] {
            const parts = word.split(",");
            for (let i = 0; i < parts.length; i++) {
                const r = this.characteristicSelectorData.verifyWord(parts[i]);
                if (r.length > 0) {
                    return r;
                }
            }

            return [];
        }
    }
}
