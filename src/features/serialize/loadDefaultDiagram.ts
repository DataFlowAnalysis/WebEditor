import { inject, injectable, optional } from "inversify";
import {
    ActionDispatcher,
    Command,
    CommandExecutionContext,
    CommandReturn,
    EMPTY_ROOT,
    ILogger,
    NullLogger,
    SModelRootImpl,
    TYPES,
} from "sprotty";
import { Action } from "sprotty-protocol";
import { LabelType, LabelTypeRegistry } from "../labels/labelTypeRegistry";
import { DynamicChildrenProcessor } from "../dfdElements/dynamicChildren";
import { LoadDiagramCommand, currentFileName, postLoadActions, setFileNameInPageTitle } from "./load";
import { SavedDiagram } from "./save";
import { EditorMode, EditorModeController } from "../editorMode/editorModeController";

import defaultDiagramData from "./defaultDiagram.json";
const defaultDiagram = defaultDiagramData as SavedDiagram;

export interface LoadDefaultDiagramAction extends Action {
    readonly kind: typeof LoadDefaultDiagramAction.KIND;
}
export namespace LoadDefaultDiagramAction {
    export const KIND = "loadDefaultDiagram";

    export function create(): LoadDefaultDiagramAction {
        return {
            kind: KIND,
        };
    }
}

@injectable()
export class LoadDefaultDiagramCommand extends Command {
    readonly blockUntil = LoadDiagramCommand.loadBlockUntilFn;

    static readonly KIND = LoadDefaultDiagramAction.KIND;
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

    private oldRoot: SModelRootImpl | undefined;
    private newRoot: SModelRootImpl | undefined;
    private oldLabelTypes: LabelType[] | undefined;
    private oldEditorMode: EditorMode | undefined;
    private oldFileName: string | undefined;

    execute(context: CommandExecutionContext): CommandReturn {
        this.oldRoot = context.root;

        const graphCopy = JSON.parse(JSON.stringify(defaultDiagram.model));
        LoadDiagramCommand.preprocessModelSchema(graphCopy);
        this.dynamicChildrenProcessor.processGraphChildren(graphCopy, "set");
        this.newRoot = context.modelFactory.createRoot(graphCopy);

        this.logger.info(this, "Default Model loaded successfully");

        if (this.labelTypeRegistry) {
            this.oldLabelTypes = this.labelTypeRegistry.getLabelTypes();
            this.labelTypeRegistry.clearLabelTypes();
            defaultDiagram.labelTypes?.forEach((labelType) => {
                this.labelTypeRegistry?.registerLabelType(labelType);
            });
            this.logger.info(this, "Default Label Types loaded successfully");
        }

        if (this.editorModeController) {
            this.oldEditorMode = this.editorModeController.getCurrentMode();
            if (defaultDiagram.mode) {
                this.editorModeController.setMode(defaultDiagram.mode);
            } else {
                this.editorModeController.setDefaultMode();
            }

            this.logger.info(this, "Default Editor Mode loaded successfully");
        }

        postLoadActions(this.newRoot, this.actionDispatcher);

        this.oldFileName = currentFileName;
        setFileNameInPageTitle(undefined);

        return this.newRoot;
    }

    undo(context: CommandExecutionContext): SModelRootImpl {
        this.labelTypeRegistry?.clearLabelTypes();
        this.oldLabelTypes?.forEach((labelType) => this.labelTypeRegistry?.registerLabelType(labelType));
        if (this.oldEditorMode) {
            this.editorModeController?.setMode(this.oldEditorMode);
        }
        setFileNameInPageTitle(this.oldFileName);

        return this.oldRoot ?? context.modelFactory.createRoot(EMPTY_ROOT);
    }

    redo(context: CommandExecutionContext): SModelRootImpl {
        this.labelTypeRegistry?.clearLabelTypes();
        defaultDiagram.labelTypes?.forEach((labelType) => {
            this.labelTypeRegistry?.registerLabelType(labelType);
        });
        if (this.editorModeController) {
            if (defaultDiagram.mode) {
                this.editorModeController.setMode(defaultDiagram.mode);
            } else {
                this.editorModeController.setDefaultMode();
            }
        }
        setFileNameInPageTitle(undefined);

        return this.newRoot ?? this.oldRoot ?? context.modelFactory.createRoot(EMPTY_ROOT);
    }
}
