import { inject, injectable, optional } from "inversify";
import { LabelType, LabelTypeRegistry, LabelTypeValue } from "../labels/labelTypeRegistry";
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
    SParentElementImpl,
    TYPES,
} from "sprotty";
import { DfdInputPortImpl, DfdOutputPortImpl } from "./ports";
import { ApplyLabelEditAction } from "sprotty-protocol";
import { DfdNodeImpl } from "./nodes";

interface LabelTypeChange {
    oldLabelType: LabelType;
    newLabelType: LabelType;
}

interface LabelTypeValueChange {
    labelType: LabelType;
    oldLabelValue: LabelTypeValue;
    newLabelValue: LabelTypeValue;
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
        @optional() @inject(LabelTypeRegistry) private readonly registry: LabelTypeRegistry | undefined,
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
        const currentLabelTypes = this.registry?.getLabelTypes() ?? [];

        const changedLabelTypes: LabelTypeChange[] = currentLabelTypes.flatMap((currentLabelType) => {
            const previousLabelType = this.previousLabelTypes.find(
                (previousLabelType) => previousLabelType.id === currentLabelType.id,
            );
            if (previousLabelType && previousLabelType.name !== currentLabelType.name) {
                return [{ oldLabelType: previousLabelType, newLabelType: currentLabelType }];
            }
            return [];
        });

        const changedLabelValues: LabelTypeValueChange[] = currentLabelTypes.flatMap((currentLabelType) => {
            const previousLabelType = this.previousLabelTypes.find(
                (previousLabelType) => previousLabelType.id === currentLabelType.id,
            );
            if (!previousLabelType) {
                return [];
            }

            return currentLabelType.values
                .flatMap((newLabelValue) => {
                    const oldLabelValue = previousLabelType.values.find(
                        (oldLabelValue) => oldLabelValue.id === newLabelValue.id,
                    );
                    if (!oldLabelValue) {
                        return [];
                    }

                    return [[oldLabelValue, newLabelValue]];
                })
                .filter(([oldLabelValue, newLabelValue]) => oldLabelValue.text !== newLabelValue?.text)
                .map(([oldLabelValue, newLabelValue]) => ({
                    labelType: currentLabelType,
                    oldLabelValue,
                    newLabelValue,
                }));
        });

        this.logger.log(this, "Changed label types", changedLabelTypes);
        this.logger.log(this, "Changed label values", changedLabelValues);

        const model = await this.commandStack.executeAll([]);
        this.traverseDfdOutputPorts(model, (port) => {
            this.processLabelRenameForPort(port, changedLabelTypes, changedLabelValues);
        });

        this.previousLabelTypes = structuredClone(currentLabelTypes);
    }

    private traverseDfdOutputPorts(element: SModelElementImpl, cb: (port: DfdOutputPortImpl) => void) {
        if (element instanceof DfdOutputPortImpl) {
            cb(element);
        }

        if (element instanceof SParentElementImpl) {
            element.children.forEach((child) => this.traverseDfdOutputPorts(child, cb));
        }
    }

    private processLabelRenameForPort(
        port: DfdOutputPortImpl,
        changedLabelTypes: LabelTypeChange[],
        changedLabelValues: LabelTypeValueChange[],
    ): void {
        const behaviorLines = port.behavior.split("\n");
        const newBehaviorLines = behaviorLines.map((line) => {
            if (!line.startsWith("set")) {
                return line;
            }

            // replace the old label type with the new one using a regex (\.?oldLabelType\.)
            // and ensure before it is a non alphanumeric character.
            // Otherwise it could replace a substring when a type has the same ending as another type.
            // Also ensure after it is a dot because after a label type there is always a dot to access the value of the label.
            let newLine = line;
            changedLabelTypes.forEach((changedLabelType) => {
                newLine = newLine.replace(
                    new RegExp(`([^a-zA-Z0-9_])${changedLabelType.oldLabelType.name}(\.)`, "g"),
                    `$1${changedLabelType.newLabelType.name}$2`,
                );
            });

            // replace the old label value with the new one using a regex (oldLabelType\.oldLabelValue)
            // and ensure before and after it is a non alphanumeric character or the end of the line.
            // Otherwise it could replace a substring when a value has the same beginning as another value
            // or the type has the same ending as another type
            changedLabelValues.forEach((changedLabelValue) => {
                newLine = newLine.replace(
                    new RegExp(
                        `([^a-zA-Z0-9_])${changedLabelValue.labelType.name}\.${changedLabelValue.oldLabelValue.text}([^a-zA-Z0-9_]|$)`,
                        "g",
                    ),
                    `$1${changedLabelValue.labelType.name}.${changedLabelValue.newLabelValue.text}$2`,
                );
            });

            return newLine;
        });

        port.behavior = newBehaviorLines.join("\n");
    }

    processInputLabelRename(
        label: SLabelImpl,
        port: DfdInputPortImpl,
        oldLabelText: string,
        newLabelText: string,
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

        node.children.forEach((child) => {
            if (!(child instanceof DfdOutputPortImpl)) {
                return;
            }

            behaviorChanges.set(child.id, this.processInputRenameForPort(child, oldInputName, newInputName));
        });

        return behaviorChanges;
    }

    private processInputRenameForPort(port: DfdOutputPortImpl, oldInputName: string, newInputName: string): string {
        const lines = port.behavior.split("\n");
        const newLines = lines.map((line) => {
            if (line.startsWith("forward")) {
                const inputString = line.substring("forward".length);
                // Update all inputs. Must be surrounded by non-alphanumeric characters to avoid replacing substrings of other inputs.
                const updatedInputs = inputString.replace(
                    new RegExp(`([^a-zA-Z0-9])${oldInputName}([^a-zA-Z0-9]|$)`, "g"),
                    `$1${newInputName}$2`,
                );
                return `forward ${updatedInputs.trim()}`;
            } else if (line.startsWith("set")) {
                // Before the input name there is always a space. After it must be a dot to access the label type
                // inside the input. We can use these two constraints to identify the input name
                // and only change inputs with that name. Label types/values with the same name are not replaced
                // because of these constraints.
                return line.replace(new RegExp(`( )${oldInputName}(\.)`, "g"), `$1${newInputName}$2`);
            } else {
                // Idk what to do with this line, just return it as is
                return line;
            }
        });

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
