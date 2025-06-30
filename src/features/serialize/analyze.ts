import { inject, injectable, optional } from "inversify";
import { Command, CommandExecutionContext, LocalModelSource, SModelRootImpl, TYPES } from "sprotty";
import { Action } from "sprotty-protocol";
import { LabelTypeRegistry } from "../labels/labelTypeRegistry";
import { DynamicChildrenProcessor } from "../dfdElements/dynamicChildren";
import { EditorModeController } from "../editorMode/editorModeController";
import { sendMessage } from "./webSocketHandler";
import { ConstraintRegistry } from "../constraintMenu/constraintRegistry";
import { SavedDiagram } from "./save";
import { LoadingIndicator } from "../../common/loadingIndicator";

export interface AnalyzeDiagramAction extends Action {
    kind: typeof AnalyzeDiagramAction.KIND;
    suggestedFileName: string;
}
export namespace AnalyzeDiagramAction {
    export const KIND = "analyze-diagram";

    export function create(suggestedFileName?: string): AnalyzeDiagramAction {
        return {
            kind: KIND,
            suggestedFileName: suggestedFileName ?? "diagram.json",
        };
    }
}

@injectable()
export class AnalyzeDiagramCommand extends Command {
    static readonly KIND = AnalyzeDiagramAction.KIND;
    @inject(TYPES.ModelSource)
    private modelSource: LocalModelSource = new LocalModelSource();
    @inject(DynamicChildrenProcessor)
    private dynamicChildrenProcessor: DynamicChildrenProcessor = new DynamicChildrenProcessor();
    @inject(LabelTypeRegistry)
    @optional()
    private labelTypeRegistry?: LabelTypeRegistry;
    @inject(EditorModeController)
    @optional()
    private editorModeController?: EditorModeController;
    @inject(ConstraintRegistry)
    @optional()
    private readonly constraintRegistry?: ConstraintRegistry;
    @inject(LoadingIndicator)
    @optional()
    private loadingIndicator?: LoadingIndicator;

    constructor() {
        super();
    }

    execute(context: CommandExecutionContext): SModelRootImpl {
        this.loadingIndicator?.showIndicator("Analyzing diagram...");
        // Convert the model to JSON
        // Do a copy because we're going to modify it
        const modelCopy = JSON.parse(JSON.stringify(this.modelSource.model));
        // Remove element children that are implementation detail
        this.dynamicChildrenProcessor.processGraphChildren(modelCopy, "remove");

        // Export the diagram as a JSON data URL.
        const diagram: SavedDiagram = {
            model: modelCopy,
            labelTypes: this.labelTypeRegistry?.getLabelTypes(),
            constraints: this.constraintRegistry?.getConstraintList(),
            mode: this.editorModeController?.getCurrentMode(),
        };
        const diagramJson = JSON.stringify(diagram, undefined, 4);
        sendMessage("Json:" + diagramJson);
        return context.root;
    }

    // Saving cannot be meaningfully undone/redone

    undo(context: CommandExecutionContext): SModelRootImpl {
        return context.root;
    }

    redo(context: CommandExecutionContext): SModelRootImpl {
        return context.root;
    }
}
