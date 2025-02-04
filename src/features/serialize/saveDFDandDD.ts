import { inject, injectable, optional } from "inversify";
import { Command, CommandExecutionContext, LocalModelSource, SModelRootImpl, TYPES } from "sprotty";
import { Action } from "sprotty-protocol";
import { LabelTypeRegistry } from "../labels/labelTypeRegistry";
import { DynamicChildrenProcessor } from "../dfdElements/dynamicChildren";
import { EditorModeController } from "../editorMode/editorModeController";
import { ws, wsId } from "./webSocketHandler";
import { modelFileName } from "../..";
import { SavedDiagram } from "./save";
import { ConstraintRegistry } from "../constraintMenu/constraintRegistry";

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
            editorMode: this.editorModeController?.getCurrentMode(),
        };
        const diagramJson = JSON.stringify(diagram, undefined, 4);
        ws.send(wsId + ":Json2DFD:" + modelFileName + ":" + diagramJson);
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
    public saveFiles(): void {
        // Save the first XML file
        const blob1 = new Blob([this.dfdString], { type: "application/xml" });
        const url1 = URL.createObjectURL(blob1);
        const link1 = document.createElement("a");
        link1.href = url1;
        link1.setAttribute("download", modelFileName + ".dataflowdiagram");
        document.body.appendChild(link1); // Append link to the body
        link1.click(); // Programmatically click to trigger download
        URL.revokeObjectURL(url1); // Revoke the URL after download
        link1.remove(); // Remove the link from the DOM

        // Save the second XML file
        const blob2 = new Blob([this.ddString], { type: "application/xml" });
        const url2 = URL.createObjectURL(blob2);
        const link2 = document.createElement("a");
        link2.href = url2;
        link2.setAttribute("download", modelFileName + ".datadictionary");
        document.body.appendChild(link2); // Append link to the body
        link2.click(); // Programmatically click to trigger download
        URL.revokeObjectURL(url2); // Revoke the URL after download
        link2.remove(); // Remove the link from the DOM
    }
}
