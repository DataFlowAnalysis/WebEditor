import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { AutoCompleteTree } from "./AutoCompletion";

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
        console.log(r);
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
            [/\/\/.*$/, "comment"],
            [/#.*$/, "comment"],

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
