import { inject, injectable } from "inversify";
import { LabelType, LabelTypeRegistry } from "../labels/labelTypeRegistry";
import {
    Command,
    CommandExecutionContext,
    CommandReturn,
    ICommandStack,
    ILogger,
    ModelSource,
    SEdgeImpl,
    SLabelImpl,
    SModelElementImpl,
    SModelRootImpl,
    SParentElementImpl,
    TYPES,
} from "sprotty";
import { DfdInputPortImpl, DfdOutputPortImpl } from "./ports";
import { ApplyLabelEditAction } from "sprotty-protocol";
import { DfdNodeImpl } from "./nodes";
import { ReplaceAutoCompleteTree, TreeBuilder } from "./AssignmentLanguage";

interface LabelChange {
    oldLabel: string;
    newLabel: string;
}

/**
 * This class listens to changes in the label type registry and updates the behavior of the DFD elements accordingly.
 * When a label type/value is renamed, the behavior of the DFD elements is updated to reflect the new name.
 * Also provides a method to refactor the behavior of a DFD element when the name of an input is changed.
 */
@injectable()
export class DFDBehaviorRefactorer {
    private previousLabelTypes: LabelType[] = [];

    constructor(
        @inject(LabelTypeRegistry) private readonly registry: LabelTypeRegistry,
        @inject(TYPES.ILogger) private readonly logger: ILogger,
        @inject(TYPES.ICommandStack) private readonly commandStack: ICommandStack,
    ) {
        if (this.registry) {
            this.previousLabelTypes = structuredClone(this.registry.getLabelTypes());
            this.registry?.onUpdate(() => {
                this.handleLabelUpdate().catch((error) =>
                    this.logger.error(this, "Error while processing label type registry update", error),
                );
            });
        }
    }

    private async handleLabelUpdate(): Promise<void> {
        this.logger.log(this, "Handling label type registry update");
        const currentLabelTypes = this.registry.getLabelTypes() ?? [];

        const changedLabels: LabelChange[] = [];
        for (const newLabel of currentLabelTypes) {
            const oldLabel = this.previousLabelTypes.find((label) => label.id === newLabel.id);
            if (!oldLabel) {
                continue;
            }
            if (oldLabel.name !== newLabel.name) {
                for (const newValue of newLabel.values) {
                    const oldValue = oldLabel.values.find((value) => value.id === newValue.id);
                    if (!oldValue) {
                        continue;
                    }
                    changedLabels.push({
                        oldLabel: `${oldLabel.name}.${oldValue.text}`,
                        newLabel: `${newLabel.name}.${newValue.text}`,
                    });
                }
            }
            for (const newValue of newLabel.values) {
                const oldValue = oldLabel.values.find((value) => value.id === newValue.id);
                if (!oldValue) {
                    continue;
                }
                if (oldValue.text !== newValue.text) {
                    changedLabels.push({
                        oldLabel: `${newLabel.name}.${oldValue.text}`,
                        newLabel: `${newLabel.name}.${newValue.text}`,
                    });
                }
            }
        }

        this.logger.log(this, "Changed labels", changedLabels);

        const model = await this.commandStack.executeAll([]);
        const tree = new ReplaceAutoCompleteTree(TreeBuilder.buildTree(model, this.registry));
        this.traverseDfdOutputPorts(model, (port) => {
            this.renameLabelsForPort(port, changedLabels, tree);
        });

        this.previousLabelTypes = structuredClone(currentLabelTypes);
    }

    private renameLabelsForPort(port: DfdOutputPortImpl, labelChanges: LabelChange[], tree: ReplaceAutoCompleteTree) {
        let lines = port.behavior.split(/\n/);
        for (const change of labelChanges) {
            lines = tree.replace(lines, change.oldLabel, change.newLabel);
        }
        port.behavior = lines.join("\n");
    }

    private traverseDfdOutputPorts(element: SModelElementImpl, cb: (port: DfdOutputPortImpl) => void) {
        if (element instanceof DfdOutputPortImpl) {
            cb(element);
        }

        if (element instanceof SParentElementImpl) {
            element.children.forEach((child) => this.traverseDfdOutputPorts(child, cb));
        }
    }

    processInputLabelRename(
        label: SLabelImpl,
        port: DfdInputPortImpl,
        oldLabelText: string,
        newLabelText: string,
        root: SModelRootImpl,
    ): Map<string, string> {
        label.text = oldLabelText;
        const oldInputName = port.getName();
        label.text = newLabelText;
        const newInputName = port.getName();

        const behaviorChanges: Map<string, string> = new Map();
        const node = port.parent;
        if (!(node instanceof DfdNodeImpl) || !oldInputName || !newInputName) {
            return behaviorChanges;
        }

        const tree = new ReplaceAutoCompleteTree(TreeBuilder.buildTree(root, this.registry));

        node.children.forEach((child) => {
            if (!(child instanceof DfdOutputPortImpl)) {
                return;
            }

            behaviorChanges.set(child.id, this.processInputRenameForPort(child, oldInputName, newInputName, tree));
        });

        return behaviorChanges;
    }

    private processInputRenameForPort(
        port: DfdOutputPortImpl,
        oldInputName: string,
        newInputName: string,
        tree: ReplaceAutoCompleteTree,
    ): string {
        const lines = port.behavior.split("\n");
        const newLines = tree.replace(lines, oldInputName, newInputName);
        return newLines.join("\n");
    }
}

/**
 * A command that refactors the behavior of DFD output ports when the name of an input is changed.
 * Designed to be added as a command handler for the ApplyLabelEditAction to automatically
 * detect all edit of labels on a edge element.
 * When a label is changed, the old and new input name of the dfd input port that the edge
 * is pointing to is used to update the behavior of all dfd output ports that are connected to the same node.
 */
export class RefactorInputNameInDFDBehaviorCommand extends Command {
    static readonly KIND = ApplyLabelEditAction.KIND;

    constructor(
        @inject(TYPES.Action) protected readonly action: ApplyLabelEditAction,
        @inject(TYPES.ModelSource) protected readonly modelSource: ModelSource,
        @inject(DFDBehaviorRefactorer) protected readonly refactorer: DFDBehaviorRefactorer,
    ) {
        super();
    }

    private oldBehaviors: Map<string, string> = new Map();
    private newBehaviors: Map<string, string> = new Map();

    execute(context: CommandExecutionContext): CommandReturn {
        // This command will be executed after the ApplyLabelEditCommand.
        // Therefore the label will already be changed in the model.
        // To get the old value we get the label from the model source,
        // which still has the old value because the model commit will be done after this command.
        const modelBeforeChange = context.modelFactory.createRoot(this.modelSource.model);
        const labelBeforeChange = modelBeforeChange.index.getById(this.action.labelId);
        if (!(labelBeforeChange instanceof SLabelImpl)) {
            // should not happen
            return context.root;
        }

        const oldInputName = labelBeforeChange.text;
        const newInputName = this.action.text;
        const edge = labelBeforeChange.parent;
        if (!(edge instanceof SEdgeImpl)) {
            // should not happen
            return context.root;
        }

        const port = edge.target;
        if (!(port instanceof DfdInputPortImpl)) {
            // Edge does not point to a dfd port, but maybe some node directly.
            // Cannot be used in behaviors in this case so we don't need to refactor anything.
            return context.root;
        }

        const behaviorChanges: Map<string, string> = this.refactorer.processInputLabelRename(
            labelBeforeChange,
            port,
            oldInputName,
            newInputName,
            context.root,
        );
        behaviorChanges.forEach((updatedBehavior, id) => {
            const port = context.root.index.getById(id);
            if (port instanceof DfdOutputPortImpl) {
                this.oldBehaviors.set(id, port.behavior);
                this.newBehaviors.set(id, updatedBehavior);
                port.behavior = updatedBehavior;
            }
        });

        return context.root;
    }

    undo(context: CommandExecutionContext): CommandReturn {
        this.oldBehaviors.forEach((oldBehavior, id) => {
            const port = context.root.index.getById(id);
            if (port instanceof DfdOutputPortImpl) {
                port.behavior = oldBehavior;
            }
        });

        return context.root;
    }

    redo(context: CommandExecutionContext): CommandReturn {
        this.newBehaviors.forEach((newBehavior, id) => {
            const port = context.root.index.getById(id);
            if (port instanceof DfdOutputPortImpl) {
                port.behavior = newBehavior;
            }
        });

        return context.root;
    }
}
