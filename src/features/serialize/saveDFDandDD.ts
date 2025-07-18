import { inject, injectable, optional } from "inversify";
import { Command, CommandExecutionContext, LocalModelSource, SModelRootImpl, TYPES } from "sprotty";
import { Action } from "sprotty-protocol";
import { LabelTypeRegistry } from "../labels/labelTypeRegistry";
import { DynamicChildrenProcessor } from "../dfdElements/dynamicChildren";
import { EditorModeController } from "../editorMode/editorModeController";
import { sendMessage } from "./webSocketHandler";
import { CURRENT_VERSION, SavedDiagram } from "./save";
import { ConstraintRegistry } from "../constraintMenu/constraintRegistry";
import { getModelFileName } from "../../index";

export interface SaveDFDandDDAction extends Action {
    kind: typeof SaveDFDandDDAction.KIND;
    file: File | undefined;
}
export namespace SaveDFDandDDAction {
    export const KIND = "save-dfd";

    export function create(file?: File): SaveDFDandDDAction {
        return {
            kind: KIND,
            file,
        };
    }
}

@injectable()
export class SaveDFDandDDCommand extends Command {
    static readonly KIND = SaveDFDandDDAction.KIND;
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

    constructor() {
        super();
    }

    execute(context: CommandExecutionContext): SModelRootImpl {
        // Convert the model to JSON
        // Do a copy because we're going to modify it
        const modelCopy = JSON.parse(JSON.stringify(this.modelSource.model));
        // Remove element children that are implementation detail
        this.dynamicChildrenProcessor.processGraphChildren(modelCopy, "remove");

        // Export the diagram as a JSON data URL.
        const diagram: SavedDiagram = {
            model: modelCopy,
            labelTypes: this.labelTypeRegistry?.getLabelTypes(),
            constraints: this.constraintRegistry?.getConstraints(),
            mode: this.editorModeController?.getCurrentMode(),
            version: CURRENT_VERSION,
        };
        const diagramJson = JSON.stringify(diagram, undefined, 4);
        sendMessage("Json2DFD:" + getModelFileName() + ":" + diagramJson);
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

export class SaveDFDandDD {
    private dfdString: string = "";
    private ddString: string = "";

    /**
     * Constructor to initialize the XML strings and filenames.
     * @param xmlString1 - The first XML string to save.
     * @param xmlString2 - The second XML string to save.
     * @param filename - The name for the first XML file (default: "example").
     */
    constructor(message: string) {
        // Define the closing tag
        const closingTag = "</dataflowdiagram:DataFlowDiagram>";
        const endIndex = message.indexOf(closingTag);

        if (endIndex !== -1) {
            // Extract everything up to and including the closing tag
            this.dfdString = message.slice(0, endIndex + closingTag.length).trim();

            // Extract everything after the closing tag
            this.ddString = message.slice(endIndex + closingTag.length).trim();
        }
    }

    /**
     * Method to save both XML files by creating Blob objects and triggering downloads.
     */
    public saveDiagramAsDFD(): void {
        const name = window.prompt("Enter file name:", getModelFileName());
        this.saveFile(this.dfdString, ".dataflowdiagram", name);
        this.saveFile(this.ddString, ".datadictionary", name);
    }

    private saveFile(file: string, ending: string, name?: string | null): void {
        const blob = new Blob([file], { type: "application/xml" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        if (!name) {
            name = getModelFileName();
        }
        link.setAttribute("download", name + ending);
        document.body.appendChild(link); // Append link to the body
        link.click(); // Programmatically click to trigger download
        URL.revokeObjectURL(url); // Revoke the URL after download
        link.remove(); // Remove the link from the DOM
    }
}
