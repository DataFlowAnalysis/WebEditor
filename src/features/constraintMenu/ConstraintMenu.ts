import { inject, injectable, optional } from "inversify";
import "./constraintMenu.css";
import { AbstractUIExtension, IActionDispatcher, LocalModelSource, TYPES } from "sprotty";
import { calculateTextSize, generateRandomSprottyId } from "../../utils";
import { Constraint, ConstraintRegistry } from "./constraintRegistry";

// Enable hover feature that is used to show validation errors.
// Inline completions are enabled to allow autocompletion of keywords and inputs/label types/label values.
import "monaco-editor/esm/vs/editor/contrib/hover/browser/hover";
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
import { Switchable } from "../../common/lightDarkSwitch";
import { AnalyzeDiagramAction } from "../serialize/analyze";

@injectable()
export class ConstraintMenu extends AbstractUIExtension implements Switchable {
    static readonly ID = "constraint-menu";
    private selectedConstraint: Constraint | undefined;
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
        editorModeController?.onModeChange((_) => {
            this.forceReadOnly = editorModeController!.isReadOnly();
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
        contentDiv.appendChild(this.buildConstraintListWrapper());
        containerElement.appendChild(this.buildRunButton());
        containerElement.appendChild(accordionContent);
    }

    private buildConstraintInputWrapper(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = "constraint-menu-input";
        wrapper.appendChild(this.editorContainer);
        this.validationLabel.id = "validation-label";
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

        const monacoTheme = window.matchMedia("(prefers-color-scheme: dark)").matches ? "vs-dark" : "vs";
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
            lineNumbers: "off",
            readOnly: this.constraintRegistry.getConstraints().length === 0 || this.forceReadOnly,
        });

        this.editor?.setValue(
            this.constraintRegistry.getConstraints()[0]?.constraint ?? "Select or create a constraint to edit",
        );

        this.editor?.onDidChangeModelContent(() => {
            if (this.selectedConstraint) {
                this.selectedConstraint.constraint = this.editor?.getValue() ?? "";
                this.constraintRegistry.constraintChanged();
            }

            this.tree.setContent(this.editor?.getValue() ?? "");
            const result = this.tree.verify();
            this.validationLabel.innerText =
                result.length == 0 ? "Valid constraint" : `Invalid constraint: ${result.length} errors`;
            this.validationLabel.classList.toggle("valid", result.length == 0);

            const model = this.editor?.getModel();
            if (!model) {
                return;
            }
            const marker: monaco.editor.IMarkerData[] = result.map((e) => ({
                severity: monaco.MarkerSeverity.Error,
                startLineNumber: 1,
                startColumn: e.startColumn + 1,
                endLineNumber: 1,
                endColumn: e.endColumn + 1,
                message: e.message,
            }));
            monaco.editor.setModelMarkers(model, "constraint", marker);
        });

        this.editor.onDidChangeCursorPosition((e) => {
            // Monaco tells us the line number after cursor position changed
            if (e.position.lineNumber > 1) {
                // Trim editor value
                this.editor?.setValue(this.editor.getValue().trim());
                // Bring back the cursor to the end of the first line
                this.editor?.setPosition({
                    ...e.position,
                    // Setting column to Infinity would mean the end of the line
                    column: Infinity,
                    lineNumber: 1,
                });
            }
        });

        return wrapper;
    }

    private buildConstraintListWrapper(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = "constraint-menu-list";

        this.rerenderConstraintList(wrapper);

        return wrapper;
    }

    private buildConstraintListItem(constraint: Constraint): HTMLElement {
        const valueElement = document.createElement("div");
        valueElement.classList.add("constrain-label");

        valueElement.onclick = () => {
            const elements = document.getElementsByClassName("constraint-label");
            for (let i = 0; i < elements.length; i++) {
                elements[i].classList.toggle("selected", elements[i] === valueElement);
            }
            this.selectConstraintListItem(constraint);
        };

        const valueInput = document.createElement("input");
        valueInput.id = "constraint-input-" + constraint.id;
        valueInput.value = constraint.name;
        valueInput.placeholder = "Name";
        this.dynamicallySetInputSize(valueInput);
        valueInput.onchange = () => {
            constraint.name = valueInput.value;
            this.constraintRegistry.constraintChanged();
        };
        valueInput.onkeydown = (e) => {
            if (e.key === "Enter") {
                e.preventDefault();
                valueInput.blur();
                this.selectConstraintListItem(constraint);
                this.editor?.focus();
            }
        };

        valueElement.appendChild(valueInput);

        const deleteButton = document.createElement("button");
        deleteButton.innerHTML = '<span class="codicon codicon-trash"></span>';
        deleteButton.onclick = (e) => {
            e.stopPropagation();
            if (this.selectedConstraint?.id === constraint.id) {
                this.selectConstraintListItem(undefined);
            }
            this.constraintRegistry.unregisterConstraint(constraint);
            this.rerenderConstraintList();
        };
        valueElement.appendChild(deleteButton);
        return valueElement;
    }

    private selectConstraintListItem(constraint?: Constraint): void {
        this.selectedConstraint = constraint;
        this.editor?.setValue(constraint?.constraint ?? "Select or create a constraint to edit");
        this.editor?.updateOptions({ readOnly: constraint === undefined || this.forceReadOnly });
        if (!constraint) {
            this.validationLabel.innerText = "";
        }
    }

    private rerenderConstraintList(list?: HTMLElement): void {
        if (!list) {
            list = document.getElementById("constraint-menu-list") ?? undefined;
        }
        if (!list) return;
        list.innerHTML = "";
        this.constraintRegistry.getConstraints().forEach((constraint) => {
            list!.appendChild(this.buildConstraintListItem(constraint));
        });

        const addButton = document.createElement("button");
        addButton.classList.add("constraint-add");
        addButton.innerHTML = '<span class="codicon codicon-add"></span> Constraint';
        addButton.onclick = () => {
            if (this.forceReadOnly) {
                return;
            }
            if (!list) {
                return;
            }

            const constraint: Constraint = {
                id: generateRandomSprottyId(),
                name: "",
                constraint: "",
            };
            this.constraintRegistry.registerConstraint(constraint);

            // Insert label type last but before the button
            const newValueElement = this.buildConstraintListItem(constraint);
            list!.insertBefore(newValueElement, list.lastChild);
            this.selectConstraintListItem(constraint);

            // Select the text input element of the new value to allow entering the value
            const input = document.getElementById("constraint-input-" + constraint.id) as HTMLInputElement;
            input.focus();
        };
        list.appendChild(addButton);
    }

    /**
     * Sets and dynamically updates the size property of the passed input element.
     * When the text is zero the width is set to the placeholder length to make place for it.
     * When the text is changed the size gets updated with the keyup event.
     * @param inputElement the html dom input element to set the size property for
     */
    private dynamicallySetInputSize(inputElement: HTMLInputElement): void {
        const handleResize = () => {
            const displayText = inputElement.value || inputElement.placeholder;
            const { width } = calculateTextSize(displayText, window.getComputedStyle(inputElement).font);

            // Values have higher padding for the rounded border
            const widthPadding = 8;
            const finalWidth = width + widthPadding;

            inputElement.style.width = finalWidth + "px";
        };

        inputElement.onkeyup = handleResize;

        // The inputElement is not added to the DOM yet, so we cannot set the size now.
        // Wait for next JS tick, after which the element has been added to the DOM and we can set the initial size
        setTimeout(handleResize, 0);
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
