import { inject } from "inversify";
import { Command, CommandExecutionContext, SModelRootImpl, TYPES } from "sprotty";
import { Action, IModelLayoutEngine, SGraph, SModelRoot } from "sprotty-protocol";
import { LoadDiagramCommand } from "../serialize/load";

export interface LayoutModelAction extends Action {
    kind: typeof LayoutModelAction.KIND;
}
export namespace LayoutModelAction {
    export const KIND = "layoutModel";

    export function create(): LayoutModelAction {
        return {
            kind: KIND,
        };
    }
}

export class LayoutModelCommand extends Command {
    static readonly KIND = LayoutModelAction.KIND;

    @inject(TYPES.IModelLayoutEngine)
    private readonly layoutEngine?: IModelLayoutEngine;

    private oldModelSchema?: SModelRoot;
    private newModel?: SModelRootImpl;

    async execute(context: CommandExecutionContext): Promise<SModelRootImpl> {
        this.oldModelSchema = context.modelFactory.createSchema(context.root);

        if (!this.layoutEngine) throw new Error("Missing injects");

        // Layouting is normally done on the graph schema.
        // This is not viable for us because the dfd nodes have a dynamically computed size.
        // This is only available on loaded classes of the elements, not the json schema.
        // Thankfully the node implementation classes have all needed properties as well.
        // So we can just force cast the graph from the loaded version into the "json graph schema".
        // Using of the "bounds" property that the implementation classes have is done using DfdElkLayoutEngine.
        const newModel = await this.layoutEngine.layout(context.root as unknown as SGraph);
        // Here we need to cast back.
        this.newModel = newModel as unknown as SModelRootImpl;
        return this.newModel;
    }

    undo(context: CommandExecutionContext): SModelRootImpl {
        if (!this.oldModelSchema) {
            // No old schema saved because the layout was not executed due to read-only mode.
            return context.root;
        }

        LoadDiagramCommand.preprocessModelSchema(this.oldModelSchema);
        return context.modelFactory.createRoot(this.oldModelSchema);
    }

    redo(context: CommandExecutionContext): SModelRootImpl {
        if (!this.newModel) {
            // No new model saved because the layout was not executed due to read-only mode.
            return context.root;
        }

        return this.newModel;
    }
}
