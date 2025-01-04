import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { AnyWord, AutoCompleteNode, AutoCompleteTree, ConstantWord, NegatableWord } from "./AutoCompletion";

export const DSL_LANGUAGE_ID = "constraint-dsl";

export class MonacoEditorConstraintDslCompletionProvider implements monaco.languages.CompletionItemProvider {
    constructor(private tree: AutoCompleteTree) {}

    triggerCharacters?: string[] | undefined;
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
    keywords: ["data", "node", "neverFlows", "to"],

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
    export function buildTree(): AutoCompleteNode[] {
        const conditions = getConditionalSelectors();
        const conditionalSelector: AutoCompleteNode = {
            word: new ConstantWord("where"),
            children: conditions,
        };

        const destinationSelectors = getAbstractSelectors();
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

        const nodeSelectors = getAbstractSelectors();
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

        const dataSelectors = getAbstractSelectors();
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

    function getAbstractSelectors(): AutoCompleteNode[] {
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
            word: new NegatableWord(new AnyWord()),
            children: [],
        };
        const dataCharacteristicSelector = {
            word: new NegatableWord(new AnyWord()),
            children: [],
        };
        const dataCharacteristicListSelector = {
            word: new NegatableWord(new AnyWord()),
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
            dataCharacteristicSelector,
            dataCharacteristicListSelector,
            variableNameSelector,
        ];
    }

    function getConditionalSelectors(): AutoCompleteNode[] {
        const variableConditionalSelector: AutoCompleteNode = {
            word: new ConstantWord("present"),
            children: [
                {
                    word: new NegatableWord(new AnyWord()),
                    children: [],
                },
            ],
        };

        const emptySetOperationSelector: AutoCompleteNode = {
            word: new ConstantWord("empty"),
            children: [
                {
                    word: new AnyWord(),
                    children: [],
                },
            ],
        };

        return [variableConditionalSelector, emptySetOperationSelector];
    }
}
