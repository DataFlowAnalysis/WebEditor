import { inject, injectable, optional } from "inversify";
import {
    AbstractUIExtension,
    ActionDispatcher,
    Command,
    CommandExecutionContext,
    CommandReturn,
    CommitModelAction,
    MouseListener,
    MouseTool,
    SModelElementImpl,
    SModelRootImpl,
    SetUIExtensionVisibilityAction,
    TYPES,
    ViewerOptions,
    getAbsoluteClientBounds,
} from "sprotty";
import { Action } from "sprotty-protocol";
import { DOMHelper } from "sprotty/lib/base/views/dom-helper";
import { matchesKeystroke } from "sprotty/lib/utils/keyboard";
import * as monaco from "monaco-editor/esm/vs/editor/editor.api";
import { DfdOutputPortImpl } from "./ports";
import { DfdNodeImpl } from "./nodes";
import { LabelTypeRegistry } from "../labels/labelTypeRegistry";
import { EditorModeController } from "../editorMode/editorModeController";
import { DFDBehaviorRefactorer } from "./behaviorRefactorer";

// Enable hover feature that is used to show validation errors.
// Inline completions are enabled to allow autocompletion of keywords and inputs/label types/label values.
import "monaco-editor/esm/vs/editor/contrib/hover/browser/hoverContribution";
import "monaco-editor/esm/vs/editor/contrib/inlineCompletions/browser/inlineCompletions.contribution.js";

import "./outputPortEditUi.css";
import { ThemeManager, Switchable } from "../settingsMenu/themeManager";
import {
    assignemntLanguageMonarchDefinition,
    MonacoEditorAssignmentLanguageCompletionProvider,
    ReplaceAutoCompleteTree,
    TreeBuilder,
} from "./AssignmentLanguage";

/**
 * Detects when a dfd output port is double clicked and shows the OutputPortEditUI
 * with the clicked port as context element.
 */
@injectable()
export class OutputPortEditUIMouseListener extends MouseListener {
    private editUIVisible = false;

    mouseDown(target: SModelElementImpl): (Action | Promise<Action>)[] {
        if (this.editUIVisible) {
            // The user has clicked somewhere on the sprotty diagram (not the port edit UI)
            // while the UI was open. In this case we hide the UI.
            // This may not be exactly accurate because the UI can close itself when
            // the change was saved but in those cases editUIVisible is still true.
            // However hiding it one more time here for those cases is not a problem.
            // Because it is already hidden, nothing will happen and after one click
            // editUIVisible will be false again.
            this.editUIVisible = false;
            return [
                SetUIExtensionVisibilityAction.create({
                    extensionId: OutputPortEditUI.ID,
                    visible: false,
                    contextElementsId: [target.id],
                }),
            ];
        }

        return [];
    }

    doubleClick(target: SModelElementImpl): (Action | Promise<Action>)[] {
        if (target instanceof DfdOutputPortImpl) {
            // The user has double clicked on a dfd output port
            // => show the OutputPortEditUI for this port.
            this.editUIVisible = true;
            return [
                SetUIExtensionVisibilityAction.create({
                    extensionId: OutputPortEditUI.ID,
                    visible: true,
                    contextElementsId: [target.id],
                }),
            ];
        }

        return [];
    }
}

/**
 * UI that allows editing the behavior text of a dfd output port (DfdOutputPortImpl).
 */
@injectable()
export class OutputPortEditUI extends AbstractUIExtension implements Switchable {
    static readonly ID = "output-port-edit-ui";

    private unavailableInputsLabel: HTMLDivElement = document.createElement("div") as HTMLDivElement;
    private editorContainer: HTMLDivElement = document.createElement("div") as HTMLDivElement;
    private validationLabel: HTMLDivElement = document.createElement("div") as HTMLDivElement;

    private port: DfdOutputPortImpl | undefined;
    private editor?: monaco.editor.IStandaloneCodeEditor;
    private tree?: ReplaceAutoCompleteTree;
    private completionProvider?: monaco.IDisposable;

    private static readonly DFD_LANGUAGE_NAME = "dfd-behavior";

    constructor(
        @inject(TYPES.IActionDispatcher) private actionDispatcher: ActionDispatcher,
        @inject(TYPES.ViewerOptions) private viewerOptions: ViewerOptions,
        @inject(TYPES.DOMHelper) private domHelper: DOMHelper,
        @inject(MouseTool) private mouseTool: MouseTool,
        // Load label type registry watcher that handles changes to the behavior of
        // output ports when label types are changed.
        // It has to be loaded somewhere for inversify to create it and start watching.
        // Since this is thematically related to the output port edit UI, it is loaded here.
        // @ts-expect-error TS6133: 'labelTypeRegistry' is declared but its value is never read.
        @inject(DFDBehaviorRefactorer) private readonly _labelTypeChangeWatcher: DFDBehaviorRefactorer,

        @inject(LabelTypeRegistry) private readonly labelTypeRegistry: LabelTypeRegistry,
        @inject(EditorModeController)
        @optional()
        private editorModeController?: EditorModeController,
    ) {
        super();
    }

    id(): string {
        return OutputPortEditUI.ID;
    }

    containerClass(): string {
        // The container element gets this class name by the sprotty base class.
        return this.id();
    }

    protected initializeContents(containerElement: HTMLElement): void {
        containerElement.appendChild(this.unavailableInputsLabel);
        containerElement.appendChild(this.editorContainer);
        containerElement.appendChild(this.validationLabel);
        const keyboardShortcutLabel = document.createElement("div");
        keyboardShortcutLabel.innerHTML = "Press <kbd>CTRL</kbd>+<kbd>Space</kbd> for autocompletion";
        containerElement.appendChild(keyboardShortcutLabel);

        containerElement.classList.add("ui-float");
        this.unavailableInputsLabel.classList.add("unavailable-inputs");
        this.editorContainer.classList.add("monaco-container");
        this.validationLabel.classList.add("validation-label");

        // Initialize the monaco editor and setup the language for highlighting and autocomplete.

        monaco.languages.register({ id: OutputPortEditUI.DFD_LANGUAGE_NAME });
        monaco.languages.setMonarchTokensProvider(
            OutputPortEditUI.DFD_LANGUAGE_NAME,
            assignemntLanguageMonarchDefinition,
        );
        this.registerCompletionProvider();

        const monacoTheme = (ThemeManager?.useDarkMode ?? true) ? "vs-dark" : "vs";
        this.editor = monaco.editor.create(this.editorContainer, {
            minimap: {
                // takes too much space, not useful for our use case
                enabled: false,
            },
            lineNumbersMinChars: 3, // default is 5, which we'll never need. Save a bit of space.
            folding: false, // Not supported by our language definition
            wordBasedSuggestions: "off", // Does not really work for our use case
            scrollBeyondLastLine: false, // Not needed
            theme: monacoTheme,
            language: OutputPortEditUI.DFD_LANGUAGE_NAME,
        });

        this.configureHandlers(containerElement);
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

        const heightRange = [100, 350] as const;
        const widthRange = [275, 650] as const;

        const cHeight = clamp(height, heightRange);
        const cWidth = clamp(width, widthRange);

        e.layout({ height: cHeight, width: cWidth });
    }

    private configureHandlers(containerElement: HTMLElement): void {
        // If the user unfocuses the editor, save the changes.
        this.editor?.onDidBlurEditorText(() => {
            this.save();
        });

        // Run behavior validation when the behavior text changes.
        this.editor?.onDidChangeModelContent(() => {
            this.validateBehavior();
        });

        // When the content size of the editor changes, resize the editor accordingly.
        this.editor?.onDidContentSizeChange(() => {
            this.resizeEditor();
        });

        // Hide/"close this window" when pressing escape.
        containerElement.addEventListener("keydown", (event) => {
            if (matchesKeystroke(event, "Escape")) {
                this.hide();
            }
        });

        containerElement.addEventListener("mouseleave", () => {
            // User might refactor some label type/value.
            // Doing so will change the behavior text of all ports referencing the label type/value.
            // Save the value so the user doesn't lose their work.
            // After the change of the behavior text, it will be reloaded into here with the refactoring done.
            this.save();
        });
        this.labelTypeRegistry?.onUpdate(() => {
            // The update handler for the refactoring might be after our handler.
            // Delay update to the next event loop tick to ensure the refactoring is done.
            setTimeout(() => {
                if (this.editor && this.port) {
                    this.editor?.setValue(this.port?.behavior);
                }
            }, 0);
        });

        // Configure editor readonly depending on editor mode.
        // Is set after opening the editor each time but the
        // editor mode may change while the editor is open, making this handler necessary.
        this.editorModeController?.onModeChange(() => {
            this.editor?.updateOptions({
                readOnly: this.editorModeController?.isReadOnly() ?? false,
            });
        });

        // we allow aliasing here so it is available in the inner class, as this would refer to the inner class
        // eslint-disable-next-line @typescript-eslint/no-this-alias
        const portEditUi = this;
        class ZoomMouseListener extends MouseListener {
            wheel(): (Action | Promise<Action>)[] {
                // Re-set position of the UI after next event loop tick.
                // In the current event loop tick the scoll is still processed and the
                // position of the port may change after the scroll processing, so we need to wait for that.
                setTimeout(() => {
                    portEditUi.setPosition(containerElement);
                });
                return [];
            }
        }
        this.mouseTool.register(new ZoomMouseListener());
    }

    protected onBeforeShow(
        containerElement: HTMLElement,
        root: Readonly<SModelRootImpl>,
        ...contextElementIds: string[]
    ): void {
        // Loads data for the port that shall be edited, which is defined by the context element id.
        if (contextElementIds.length !== 1) {
            throw new Error(
                "Expected exactly one context element id which should be the port that shall be shown in the UI.",
            );
        }
        this.port = root.index.getById(contextElementIds[0]) as DfdOutputPortImpl;
        this.setPosition(containerElement);

        const parent = this.port.parent;
        if (!(parent instanceof DfdNodeImpl)) {
            throw new Error("Expected parent to be a DfdNodeImpl.");
        }

        const availableInputNames = parent.getAvailableInputs();
        const countUnavailableDueToMissingName = availableInputNames.filter((name) => name === undefined).length;

        if (countUnavailableDueToMissingName > 0) {
            const unavailableInputsText =
                countUnavailableDueToMissingName > 1
                    ? `There are ${countUnavailableDueToMissingName} inputs that don't have a named edge and cannot be used`
                    : `There is ${countUnavailableDueToMissingName} input that doesn't have a named edge and cannot be used`;

            this.unavailableInputsLabel.innerText = unavailableInputsText;
            this.unavailableInputsLabel.style.display = "block";
        } else {
            this.unavailableInputsLabel.innerText = "";
            this.unavailableInputsLabel.style.display = "none";
        }

        // Load the current behavior text of the port into the text editor.
        this.editor?.setValue(this.port.behavior);
        this.editor?.getModel()?.setEOL(monaco.editor.EndOfLineSequence.LF);
        this.resizeEditor();

        // Configure editor readonly depending on editor mode
        this.editor?.updateOptions({
            readOnly: this.editorModeController?.isReadOnly() ?? false,
        });

        this.tree = new ReplaceAutoCompleteTree(TreeBuilder.buildTree(this.labelTypeRegistry, this.port));

        // Validation of loaded behavior text.
        this.validateBehavior();

        this.registerCompletionProvider();

        // Wait for the next event loop tick to focus the port edit UI.
        // The user may have clicked more times before the show click was processed
        // (showing the UI takes some time due to finding the element in the graph, etc.).
        // There might still be some clicks in the event loop queue queue which would de-focus the port edit UI.
        // Instead process them (fast as no UI is shown or similar slow tasks are done) and then focus the UI.
        setTimeout(() => {
            this.editor?.focus();
        }, 0); // 0ms => next event loop tick
    }

    private registerCompletionProvider() {
        if (!this.tree) {
            return;
        }
        this.completionProvider?.dispose();
        this.completionProvider = monaco.languages.registerCompletionItemProvider(
            OutputPortEditUI.DFD_LANGUAGE_NAME,
            new MonacoEditorAssignmentLanguageCompletionProvider(this.tree),
        );
    }

    /**
     * Sets the position of the UI to the position of the port that is currently edited.
     */
    private setPosition(containerElement: HTMLElement) {
        if (!this.port) {
            return;
        }

        const bounds = getAbsoluteClientBounds(this.port, this.domHelper, this.viewerOptions);
        containerElement.style.left = `${bounds.x}px`;
        containerElement.style.top = `${bounds.y}px`;
    }

    private validateBehavior(): void {
        if (!this.port) {
            return;
        }

        if (!this.editor) {
            return;
        }
        if (!this.tree) {
            return;
        }

        const model = this.editor?.getModel();
        if (!model) {
            return;
        }

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

        if (marker.length == 0) {
            this.validationLabel.innerText = "Assignments are valid";
            this.validationLabel.classList.remove("validation-error");
            this.validationLabel.classList.add("validation-success");
        } else {
            this.validationLabel.innerText = `Assignments are invalid: ${marker.length} error${
                marker.length === 1 ? "" : "s"
            }.`;
            this.validationLabel.classList.remove("validation-success");
            this.validationLabel.classList.add("validation-error");
        }

        monaco.editor.setModelMarkers(model, "assignment", marker);
    }

    /**
     * Saves the current behavior text inside the editor to the port.
     */
    private save(): void {
        if (!this.port) {
            throw new Error("Cannot save without set port.");
        }

        const behaviorText = this.editor?.getValue() ?? "";
        this.actionDispatcher.dispatch(SetDfdOutputPortBehaviorAction.create(this.port.id, behaviorText));
        this.actionDispatcher.dispatch(CommitModelAction.create());
    }

    public getCurrentEditingPort(): DfdOutputPortImpl | undefined {
        return this.port;
    }

    switchTheme(useDark: boolean): void {
        this.editor?.updateOptions({ theme: useDark ? "vs-dark" : "vs" });
    }
}

/**
 * Sets the behavior property of a dfd output port (DfdOutputPortImpl).
 * This is used by the OutputPortEditUI but implemented as an action for undo/redo support.
 */
export interface SetDfdOutputPortBehaviorAction extends Action {
    kind: typeof SetDfdOutputPortBehaviorAction.KIND;
    portId: string;
    behavior: string;
}
export namespace SetDfdOutputPortBehaviorAction {
    export const KIND = "setDfdOutputPortBehavior";
    export function create(portId: string, behavior: string): SetDfdOutputPortBehaviorAction {
        return {
            kind: KIND,
            portId,
            behavior,
        };
    }
}

@injectable()
export class SetDfdOutputPortBehaviorCommand extends Command {
    static readonly KIND = SetDfdOutputPortBehaviorAction.KIND;

    constructor(@inject(TYPES.Action) private action: SetDfdOutputPortBehaviorAction) {
        super();
    }

    private oldBehavior: string | undefined;

    execute(context: CommandExecutionContext): CommandReturn {
        const port = context.root.index.getById(this.action.portId) as DfdOutputPortImpl;
        this.oldBehavior = port.behavior;
        port.behavior = this.action.behavior;
        return context.root;
    }

    undo(context: CommandExecutionContext): CommandReturn {
        const port = context.root.index.getById(this.action.portId) as DfdOutputPortImpl;
        if (this.oldBehavior) {
            port.behavior = this.oldBehavior;
        }

        return context.root;
    }

    redo(context: CommandExecutionContext): CommandReturn {
        return this.execute(context);
    }
}
