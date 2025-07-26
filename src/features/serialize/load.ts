import {
    ActionDispatcher,
    Command,
    CommandExecutionContext,
    EMPTY_ROOT,
    ILogger,
    NullLogger,
    SModelRootImpl,
    SNodeImpl,
    TYPES,
    isLocateable,
} from "sprotty";
import { Action, SModelElement, SModelRoot } from "sprotty-protocol";
import { DynamicChildrenProcessor } from "../dfdElements/dynamicChildren";
import { inject, optional } from "inversify";
import { createDefaultFitToScreenAction } from "../../utils";
import { SavedDiagram } from "./save";
import { LabelType, LabelTypeRegistry } from "../labels/labelTypeRegistry";
import { LayoutModelAction } from "../autoLayout/command";
import { EditorMode, EditorModeController } from "../editorMode/editorModeController";
import { Constraint, ConstraintRegistry } from "../constraintMenu/constraintRegistry";
import { LoadingIndicator } from "../../common/loadingIndicator";
import { ChooseConstraintAction } from "../constraintMenu/actions";

export interface LoadDiagramAction extends Action {
    kind: typeof LoadDiagramAction.KIND;
    file: File | undefined;
}
export namespace LoadDiagramAction {
    export const KIND = "load-diagram";

    export function create(file?: File): LoadDiagramAction {
        return {
            kind: KIND,
            file,
        };
    }
}

export class LoadDiagramCommand extends Command {
    static readonly KIND = LoadDiagramAction.KIND;

    constructor(@inject(TYPES.Action) private readonly action: LoadDiagramAction) {
        super();
    }

    // After loading a diagram, this command dispatches other actions like fit to screen
    // and optional auto layouting. However when returning a new model in the execute method,
    // the diagram is not directly updated. We need to wait for the
    // InitializeCanvasBoundsCommand to be fired and finish before we can do things like fit to screen.
    // Because of that we block the execution newly dispatched actions including
    // the actions we dispatched after loading the diagram until
    // the InitializeCanvasBoundsCommand has been processed.
    // This works because the canvasBounds property is always removed before loading a diagram,
    // requiring the InitializeCanvasBoundsCommand to be fired.
    readonly blockUntil = LoadDiagramCommand.loadBlockUntilFn;
    static readonly loadBlockUntilFn = (action: Action) => {
        return action.kind === "initializeCanvasBounds";
    };

    @inject(TYPES.ILogger)
    private readonly logger: ILogger = new NullLogger();
    @inject(DynamicChildrenProcessor)
    private readonly dynamicChildrenProcessor: DynamicChildrenProcessor = new DynamicChildrenProcessor();
    @inject(TYPES.IActionDispatcher)
    private readonly actionDispatcher: ActionDispatcher = new ActionDispatcher();
    @inject(LabelTypeRegistry)
    @optional()
    private readonly labelTypeRegistry?: LabelTypeRegistry;
    @inject(EditorModeController)
    @optional()
    private editorModeController?: EditorModeController;
    @inject(ConstraintRegistry)
    @optional()
    private readonly constraintRegistry?: ConstraintRegistry;
    @inject(LoadingIndicator)
    @optional()
    private readonly loadingIndicator?: LoadingIndicator;

    private oldRoot: SModelRootImpl | undefined;
    private newRoot: SModelRootImpl | undefined;
    private oldLabelTypes: LabelType[] | undefined;
    private newLabelTypes: LabelType[] | undefined;
    private oldEditorMode: EditorMode | undefined;
    private newEditorMode: EditorMode | undefined;
    private oldFileName: string | undefined;
    private newFileName: string | undefined;
    private oldConstrains: Constraint[] | undefined;
    private newConstrains: Constraint[] | undefined;

    /**
     * Gets the model file from the action or opens a file picker dialog if no file is provided.
     * @returns A promise that resolves to the model file.
     */
    private getModelFile(): Promise<File | undefined> {
        if (this.action.file) {
            return Promise.resolve(this.action.file);
        }

        // Open a file picker dialog if no file is provided in the action.
        // The cleaner way to do this would be showOpenFilePicker(),
        // but safari and firefox don't support it at the time of writing this code:
        // https://developer.mozilla.org/en-US/docs/web/api/window/showOpenFilePicker#browser_compatibility
        const input = document.createElement("input");
        input.type = "file";
        input.accept = "application/json";
        const fileLoadPromise = new Promise<File | undefined>((resolve, reject) => {
            // This event is fired when the user successfully submits the file picker dialog.
            input.onchange = () => {
                if (input.files && input.files.length > 0) {
                    const file = input.files[0];
                    if (file.type !== "application/json") {
                        reject("Diagram file must be in JSON format");
                        return;
                    }

                    resolve(file);
                } else {
                    reject("No file selected");
                }
            };
            // The focus event is fired when the file picker dialog is closed.
            // This includes cases where a file was selected and when the dialog was canceled and no file was selected.
            // If a file was selected the change event above is fired after the focus event.
            // So if a file was selected the focus event should be ignored and the promise is resolved in the onchange handler.
            // If the file dialog was canceled undefined should be resolved by the focus handler.
            // Because we don't know whether the change event will follow the focus event,
            // we have a 300ms timeout before resolving the promise.
            // If the promise was already resolved by the onchange handler, this won't do anything.
            window.addEventListener(
                "focus",
                () => {
                    setTimeout(() => {
                        resolve(undefined);
                    }, 300);
                },
                { once: true },
            );
        });
        input.click();

        return fileLoadPromise;
    }

    async execute(context: CommandExecutionContext): Promise<SModelRootImpl> {
        this.loadingIndicator?.showIndicator("Loading model...");
        this.oldRoot = context.root;
        try {
            const file = await this.getModelFile();
            if (!file) {
                // No file was selected, skip
                this.loadingIndicator?.hideIndicator();
                return context.root;
            }

            const newDiagram = await new Promise<SavedDiagram>((resolve, reject) => {
                const reader = new FileReader();
                reader.onload = () => {
                    const json = reader.result as string;
                    try {
                        const model = JSON.parse(json);
                        resolve(model);
                    } catch (error) {
                        reject(error);
                    }
                };
                reader.onerror = () => {
                    reject(reader.error);
                };
                reader.readAsText(file);
            });

            const newSchema = newDiagram?.model;
            if (!newSchema) {
                this.logger.info(this, "Model loading aborted");
                this.newRoot = this.oldRoot;
                this.loadingIndicator?.hideIndicator();
                return this.oldRoot;
            }

            // Load sprotty model
            LoadDiagramCommand.preprocessModelSchema(newSchema);
            this.dynamicChildrenProcessor.processGraphChildren(newSchema, "set");
            this.newRoot = context.modelFactory.createRoot(newSchema);

            this.logger.info(this, "Model loaded successfully");

            if (this.labelTypeRegistry) {
                // Load label types
                this.oldLabelTypes = this.labelTypeRegistry.getLabelTypes();
                this.newLabelTypes = newDiagram?.labelTypes;
                this.labelTypeRegistry.clearLabelTypes();
                if (newDiagram?.labelTypes) {
                    newDiagram.labelTypes.forEach((labelType) => {
                        this.labelTypeRegistry?.registerLabelType(labelType);
                    });

                    this.logger.info(this, "Label types loaded successfully");
                }
            }

            if (this.editorModeController) {
                // Load editor mode
                this.oldEditorMode = this.editorModeController.getCurrentMode();
                this.newEditorMode = newDiagram?.mode;
                if (newDiagram?.mode) {
                    this.editorModeController.setMode(newDiagram.mode);
                } else {
                    this.editorModeController.setDefaultMode();
                }

                this.logger.info(this, "Editor mode loaded successfully");
            }

            if (this.constraintRegistry) {
                // Load label types
                this.oldConstrains = this.constraintRegistry.getConstraintList();
                this.newConstrains = newDiagram?.constraints;
                this.constraintRegistry.clearConstraints();
                if (newDiagram?.constraints) {
                    this.constraintRegistry.setConstraintsFromArray(newDiagram.constraints);

                    this.logger.info(this, "Constraints loaded successfully");
                }
            }

            postLoadActions(this.newRoot, this.actionDispatcher);

            if (this.constraintRegistry) {
                this.constraintRegistry.setAllConstraintsAsSelected();
                this.actionDispatcher.dispatch(
                    ChooseConstraintAction.create(this.constraintRegistry!.getConstraintList().map((c) => c.name)),
                );
            }

            this.oldFileName = currentFileName;
            this.newFileName = file.name;
            setFileNameInPageTitle(file.name);

            this.loadingIndicator?.hideIndicator();
            return this.newRoot;
        } catch (error) {
            this.logger.error(this, "Error loading model", error);
            alert("Error loading model: " + error);
            this.newRoot = this.oldRoot;

            this.loadingIndicator?.hideIndicator();
            return this.oldRoot;
        }
    }

    /**
     * Before a saved model schema can be loaded, it needs to be preprocessed.
     * Currently this means that the features property is removed from all model elements recursively.
     * Additionally the canvasBounds property is removed from the root element, because it may change
     * depending on browser window.
     * In the future this method may be extended to preprocess other properties.
     *
     * The feature property at runtime is a js Set with the relevant features.
     * E.g. for the top graph this is the viewportFeature among others.
     * When converting js Sets objects into json, the result is an empty js object.
     * When loading the object is converted into an empty js Set and the features are lost.
     * Because of this the editor won't work properly after loading a model.
     * To prevent this, the features property is removed before loading the model.
     * When the features property is missing it gets rebuilt on loading with the currently used features.
     *
     * @param modelSchema The model schema to preprocess
     */
    public static preprocessModelSchema(modelSchema: SModelRoot): void {
        // These properties are all not included in the root typing and if present are not loaded and handled correctly. So they are removed.
        if ("features" in modelSchema) {
            delete modelSchema["features"];
        }
        if ("canvasBounds" in modelSchema) {
            delete modelSchema["canvasBounds"];
        }

        if (modelSchema.children) {
            modelSchema.children.forEach((child: SModelElement) => this.preprocessModelSchema(child));
        }
    }

    undo(context: CommandExecutionContext): SModelRootImpl {
        this.loadingIndicator?.showIndicator("Undoing load...");
        this.labelTypeRegistry?.clearLabelTypes();
        this.oldLabelTypes?.forEach((labelType) => this.labelTypeRegistry?.registerLabelType(labelType));
        if (this.oldEditorMode) {
            this.editorModeController?.setMode(this.oldEditorMode);
        }
        this.constraintRegistry?.clearConstraints();
        if (this.oldConstrains) {
            this.constraintRegistry?.setConstraintsFromArray(this.oldConstrains);
        }
        setFileNameInPageTitle(this.oldFileName);

        this.loadingIndicator?.hideIndicator();
        return this.oldRoot ?? context.modelFactory.createRoot(EMPTY_ROOT);
    }

    redo(context: CommandExecutionContext): SModelRootImpl {
        this.loadingIndicator?.showIndicator("Redoing load...");
        this.labelTypeRegistry?.clearLabelTypes();
        this.newLabelTypes?.forEach((labelType) => this.labelTypeRegistry?.registerLabelType(labelType));
        if (this.editorModeController) {
            if (this.newEditorMode) {
                this.editorModeController.setMode(this.newEditorMode);
            } else {
                this.editorModeController.setDefaultMode();
            }
        }
        this.constraintRegistry?.clearConstraints();
        if (this.newConstrains) {
            this.constraintRegistry?.setConstraintsFromArray(this.newConstrains);
        }
        setFileNameInPageTitle(this.newFileName);

        this.loadingIndicator?.hideIndicator();
        return this.newRoot ?? this.oldRoot ?? context.modelFactory.createRoot(EMPTY_ROOT);
    }
}

/**
 * Utility function to fit the diagram to the screen after loading a model inside a command.
 * Captures all element ids and dispatches a FitToScreenAction.
 * Also performs auto layouting if there are unpositioned nodes.
 */
export async function postLoadActions(
    newRoot: SModelRootImpl | undefined,
    actionDispatcher: ActionDispatcher,
): Promise<void> {
    if (!newRoot) {
        return;
    }

    // Layouting:
    const containsUnPositionedNodes = newRoot.children
        .filter((child) => child instanceof SNodeImpl)
        .some((child) => isLocateable(child) && child.position.x === 0 && child.position.y === 0);
    if (containsUnPositionedNodes) {
        await actionDispatcher.dispatch(LayoutModelAction.create());
    }

    // fit to screen is done after auto layouting because that may change the bounds of the diagram
    // requiring another fit to screen.
    await actionDispatcher.dispatch(createDefaultFitToScreenAction(newRoot, false));
}

let initialPageTitle: string | undefined;
export let currentFileName: string | undefined;

/**
 * Sets the file name in the page title.
 * If the given file name is undefined, no file name is displayed in the page title.
 * The current file name is stored in the exported currentFileName variable.
 */
export function setFileNameInPageTitle(filename: string | undefined) {
    if (!initialPageTitle) {
        initialPageTitle = document.title;
    }

    currentFileName = filename;
    if (filename) {
        document.title = `${filename} - ${initialPageTitle}`;
    } else {
        document.title = initialPageTitle;
    }
}
