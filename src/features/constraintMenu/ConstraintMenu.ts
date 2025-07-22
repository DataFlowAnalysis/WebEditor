import { inject, injectable, optional } from "inversify";
import "./constraintMenu.css";
import { AbstractUIExtension, IActionDispatcher, LocalModelSource, TYPES } from "sprotty";
import { ConstraintRegistry } from "./constraintRegistry";

// Enable hover feature that is used to show validation errors.
// Inline completions are enabled to allow autocompletion of keywords and inputs/label types/label values.
import "monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution";
import "monaco-editor/esm/vs/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import {
    constraintDslLanguageMonarchDefinition,
    DSL_LANGUAGE_ID,
    MonacoEditorConstraintDslCompletionProvider,
} from "./DslLanguage";
import { AutoCompleteTree } from "./AutoCompletion";
import { TreeBuilder } from "./DslLanguage";
import { LabelTypeRegistry } from "../labels/labelTypeRegistry";
import { EditorModeController } from "../editorMode/editorModeController";
import { Switchable, ThemeManager } from "../settingsMenu/themeManager";
import { AnalyzeDiagramAction } from "../serialize/analyze";

@injectable()
export class ConstraintMenu extends AbstractUIExtension implements Switchable {
    static readonly ID = "constraint-menu";
    private editorContainer: HTMLDivElement = document.createElement("div") as HTMLDivElement;
    private validationLabel: HTMLDivElement = document.createElement("div") as HTMLDivElement;
    private editor?: monaco.editor.IStandaloneCodeEditor;
    private tree: AutoCompleteTree;
    private forceReadOnly: boolean;

    constructor(
        @inject(ConstraintRegistry) private readonly constraintRegistry: ConstraintRegistry,
        @inject(LabelTypeRegistry) labelTypeRegistry: LabelTypeRegistry,
        @inject(TYPES.ModelSource) modelSource: LocalModelSource,
        @inject(TYPES.IActionDispatcher) private readonly dispatcher: IActionDispatcher,
        @inject(EditorModeController)
        @optional()
        editorModeController?: EditorModeController,
    ) {
        super();
        this.constraintRegistry = constraintRegistry;
        this.tree = new AutoCompleteTree(TreeBuilder.buildTree(modelSource, labelTypeRegistry));
        this.forceReadOnly = editorModeController?.getCurrentMode() !== "edit";
        editorModeController?.onModeChange(() => {
            this.forceReadOnly = editorModeController!.isReadOnly();
        });
        constraintRegistry.onUpdate(() => {
            if (this.editor) {
                const editorText = this.editor.getValue();
                // Only update the editor if the constraints have changed
                if (editorText !== this.constraintRegistry.getConstraintsAsText()) {
                    this.editor.setValue(this.constraintRegistry.getConstraintsAsText() || "");
                }
            }
        });
    }

    id(): string {
        return ConstraintMenu.ID;
    }
    containerClass(): string {
        return ConstraintMenu.ID;
    }
    protected initializeContents(containerElement: HTMLElement): void {
        containerElement.classList.add("ui-float");
        containerElement.innerHTML = `
            <input type="checkbox" id="expand-state-constraint" class="accordion-state" hidden>
            <label id="constraint-menu-expand-label" for="expand-state-constraint">
                <div class="accordion-button cevron-left flip-arrow" id="constraint-menu-expand-title">
                    Constraints
                </div>
            </label>
        `;
        const accordionContent = document.createElement("div");
        accordionContent.classList.add("accordion-content");
        const contentDiv = document.createElement("div");
        contentDiv.id = "constraint-menu-content";
        accordionContent.appendChild(contentDiv);
        contentDiv.appendChild(this.buildConstraintInputWrapper());
        containerElement.appendChild(this.buildRunButton());
        containerElement.appendChild(accordionContent);
    }

    private buildConstraintInputWrapper(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = "constraint-menu-input";
        wrapper.appendChild(this.editorContainer);
        this.validationLabel.id = "validation-label";
        this.validationLabel.classList.add("valid");
        this.validationLabel.innerText = "Valid constraints";
        wrapper.appendChild(this.validationLabel);
        const keyboardShortcutLabel = document.createElement("div");
        keyboardShortcutLabel.innerHTML = "Press <kbd>CTRL</kbd>+<kbd>Space</kbd> for autocompletion";
        wrapper.appendChild(keyboardShortcutLabel);

        monaco.languages.register({ id: DSL_LANGUAGE_ID });
        monaco.languages.setMonarchTokensProvider(DSL_LANGUAGE_ID, constraintDslLanguageMonarchDefinition);
        monaco.languages.registerCompletionItemProvider(
            DSL_LANGUAGE_ID,
            new MonacoEditorConstraintDslCompletionProvider(this.tree),
        );

        const monacoTheme = ThemeManager.useDarkMode ? "vs-dark" : "vs";
        this.editor = monaco.editor.create(this.editorContainer, {
            minimap: {
                // takes too much space, not useful for our use case
                enabled: false,
            },
            folding: false, // Not supported by our language definition
            wordBasedSuggestions: "off", // Does not really work for our use case
            scrollBeyondLastLine: false, // Not needed
            theme: monacoTheme,
            wordWrap: "on",
            language: DSL_LANGUAGE_ID,
            scrollBeyondLastColumn: 0,
            scrollbar: {
                horizontal: "hidden",
                vertical: "auto",
                // avoid can not scroll page when hover monaco
                alwaysConsumeMouseWheel: false,
            },
            lineNumbers: "on",
            readOnly: this.forceReadOnly,
        });

        this.editor?.setValue(this.constraintRegistry.getConstraintsAsText() || "");

        this.editor?.onDidChangeModelContent(() => {
            if (!this.editor) {
                return;
            }

            const model = this.editor?.getModel();
            if (!model) {
                return;
            }

            this.constraintRegistry.setConstraints(model.getLinesContent());

            const content = model.getLinesContent();
            const marker: monaco.editor.IMarkerData[] = [];
            const emptyContent = content.length == 0 || (content.length == 1 && content[0] === "");
            // empty content gets accepted as valid as it represents no constraints
            if (!emptyContent) {
                const errors = this.tree.verify(content);
                marker.push(
                    ...errors.map((e) => ({
                        severity: monaco.MarkerSeverity.Error,
                        startLineNumber: e.line,
                        startColumn: e.startColumn,
                        endLineNumber: e.line,
                        endColumn: e.endColumn,
                        message: e.message,
                    })),
                );
            }

            this.validationLabel.innerText =
                marker.length == 0 ? "Valid constraints" : `Invalid constraints: ${marker.length} errors`;
            this.validationLabel.classList.toggle("valid", marker.length == 0);

            monaco.editor.setModelMarkers(model, "constraint", marker);
        });

        return wrapper;
    }

    private buildRunButton(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = "run-button-container";

        const button = document.createElement("button");
        button.id = "run-button";
        button.innerHTML = "Run";
        button.onclick = () => {
            this.dispatcher.dispatch(AnalyzeDiagramAction.create());
        };

        wrapper.appendChild(button);
        return wrapper;
    }

    protected onBeforeShow(): void {
        this.resizeEditor();
    }

    private resizeEditor(): void {
        // Resize editor to fit content.
        // Has ranges for height and width to prevent the editor from getting too small or too large.
        const e = this.editor;
        if (!e) {
            return;
        }

        // For the height we can use the content height from the editor.
        const height = e.getContentHeight();

        // For the width we cannot really do this.
        // Monaco needs about 500ms to figure out the correct width when initially showing the editor.
        // In the mean time the width will be too small and after the update
        // the window size will jump visibly.
        // So for the width we use this calculation to approximate the width.
        const maxLineLength = e
            .getValue()
            .split("\n")
            .reduce((max, line) => Math.max(max, line.length), 0);
        const width = 100 + maxLineLength * 8;

        const clamp = (value: number, range: readonly [number, number]) =>
            Math.min(range[1], Math.max(range[0], value));

        const heightRange = [200, 200] as const;
        const widthRange = [500, 750] as const;

        const cHeight = clamp(height, heightRange);
        const cWidth = clamp(width, widthRange);

        e.layout({ height: cHeight, width: cWidth });
    }

    switchTheme(useDark: boolean): void {
        this.editor?.updateOptions({ theme: useDark ? "vs-dark" : "vs" });
    }
}
