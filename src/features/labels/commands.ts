import { Action } from "sprotty-protocol";
import {
    Command,
    CommandExecutionContext,
    CommandReturn,
    ISnapper,
    isSelected,
    SChildElementImpl,
    SModelElementImpl,
    SNodeImpl,
    SParentElementImpl,
    TYPES,
} from "sprotty";
import { injectable, inject, optional } from "inversify";
import { ContainsDfdLabels, containsDfdLabels } from "./elementFeature";
import { LabelAssignment, LabelTypeRegistry } from "./labelTypeRegistry";
import { snapPortsOfNode } from "../dfdElements/portSnapper";
import { EditorModeController } from "../editorMode/editorModeController";

interface LabelAction extends Action {
    element?: ContainsDfdLabels & SNodeImpl;
    labelAssignment: LabelAssignment;
}
abstract class LabelCommand extends Command {
    @inject(EditorModeController)
    @optional()
    protected readonly editorModeController?: EditorModeController;

    protected elements?: SModelElementImpl[];

    constructor(
        @inject(TYPES.Action) protected action: LabelAction,
        @inject(TYPES.ISnapper) protected snapper: ISnapper,
    ) {
        super();
    }

    protected fetchElements(context: CommandExecutionContext): SModelElementImpl[] {
        if (this.editorModeController?.isReadOnly()) {
            return [];
        }

        const allElements = getAllElements(context.root.children);
        const selectedElements = allElements.filter((element) => isSelected(element));

        const selectionHasElement =
            selectedElements.find((element) => element.id === this.action.element?.id) !== undefined;
        if (selectionHasElement) {
            return selectedElements;
        }
        return this.action.element ? [this.action.element] : selectedElements;
    }

    protected addLabel(context: CommandExecutionContext) {
        if (this.editorModeController?.isReadOnly()) {
            return context.root;
        }

        if (this.elements === undefined) {
            this.elements = this.fetchElements(context);
        }

        this.elements.forEach((element) => {
            if (containsDfdLabels(element)) {
                const hasBeenAdded =
                    element.labels.find((as) => {
                        return (
                            as.labelTypeId === this.action.labelAssignment.labelTypeId &&
                            as.labelTypeValueId === this.action.labelAssignment.labelTypeValueId
                        );
                    }) !== undefined;
                if (!hasBeenAdded) {
                    element.labels.push(this.action.labelAssignment);
                    if (element instanceof SNodeImpl) {
                        snapPortsOfNode(element, this.snapper);
                    }
                }
            }
        });

        return context.root;
    }

    protected removeLabel(context: CommandExecutionContext) {
        if (this.editorModeController?.isReadOnly()) {
            return context.root;
        }

        if (this.elements === undefined) {
            this.elements = this.fetchElements(context);
        }

        this.elements.forEach((element) => {
            if (containsDfdLabels(element)) {
                const labels = element.labels;
                const idx = labels.findIndex(
                    (l) =>
                        l.labelTypeId == this.action.labelAssignment.labelTypeId &&
                        l.labelTypeValueId == this.action.labelAssignment.labelTypeValueId,
                );
                if (idx >= 0) {
                    labels.splice(idx, 1);
                    if (element instanceof SNodeImpl) {
                        snapPortsOfNode(element, this.snapper);
                    }
                }
            }
        });

        return context.root;
    }
}

export interface AddLabelAssignmentAction extends LabelAction {
    kind: typeof AddLabelAssignmentAction.TYPE;
}
export namespace AddLabelAssignmentAction {
    export const TYPE = "add-label-assignment";
    export function create(
        labelAssignment: LabelAssignment,
        element?: ContainsDfdLabels & SNodeImpl,
    ): AddLabelAssignmentAction {
        return {
            kind: TYPE,
            element,
            labelAssignment,
        };
    }
}

@injectable()
export class AddLabelAssignmentCommand extends LabelCommand {
    public static readonly KIND = AddLabelAssignmentAction.TYPE;

    constructor(@inject(TYPES.Action) action: AddLabelAssignmentAction, @inject(TYPES.ISnapper) snapper: ISnapper) {
        super(action, snapper);
    }

    execute(context: CommandExecutionContext): CommandReturn {
        return this.addLabel(context);
    }

    undo(context: CommandExecutionContext): CommandReturn {
        return this.removeLabel(context);
    }

    redo(context: CommandExecutionContext): CommandReturn {
        return this.execute(context);
    }
}

export interface DeleteLabelAssignmentAction extends LabelAction {
    kind: typeof DeleteLabelAssignmentAction.TYPE;
}
export namespace DeleteLabelAssignmentAction {
    export const TYPE = "delete-label-assignment";
    export function create(
        labelAssignment: LabelAssignment,
        element?: ContainsDfdLabels & SNodeImpl,
    ): DeleteLabelAssignmentAction {
        return {
            kind: TYPE,
            element,
            labelAssignment,
        };
    }
}

@injectable()
export class DeleteLabelAssignmentCommand extends LabelCommand {
    public static readonly KIND = DeleteLabelAssignmentAction.TYPE;

    constructor(@inject(TYPES.Action) action: DeleteLabelAssignmentAction, @inject(TYPES.ISnapper) snapper: ISnapper) {
        super(action, snapper);
    }

    execute(context: CommandExecutionContext): CommandReturn {
        return this.removeLabel(context);
    }

    undo(context: CommandExecutionContext): CommandReturn {
        return this.addLabel(context);
    }

    redo(context: CommandExecutionContext): CommandReturn {
        return this.execute(context);
    }
}

/**
 * Recursively traverses the sprotty diagram graph and removes all labels that match the given predicate.
 * @param predicate a function deciding whether the label assignment should be kept
 */
function removeLabelsFromGraph(
    element: SModelElementImpl | SParentElementImpl,
    snapper: ISnapper,
    predicate: (type: LabelAssignment) => boolean,
): void {
    if (containsDfdLabels(element)) {
        const filteredLabels = element.labels.filter(predicate);
        if (filteredLabels.length !== element.labels.length) {
            element.labels = filteredLabels;
            if (containsDfdLabels(element) && element instanceof SNodeImpl) {
                snapPortsOfNode(element, snapper);
            }
        }
    }

    if ("children" in element) {
        element.children.forEach((child) => removeLabelsFromGraph(child, snapper, predicate));
    }
}

export interface DeleteLabelTypeValueAction extends Action {
    kind: typeof DeleteLabelTypeValueAction.TYPE;
    registry: LabelTypeRegistry;
    labelTypeId: string;
    labelTypeValueId: string;
}
export namespace DeleteLabelTypeValueAction {
    export const TYPE = "delete-label-type-value";
    export function create(
        registry: LabelTypeRegistry,
        labelTypeId: string,
        labelTypeValueId: string,
    ): DeleteLabelTypeValueAction {
        return {
            kind: TYPE,
            registry,
            labelTypeId,
            labelTypeValueId,
        };
    }
}

@injectable()
export class DeleteLabelTypeValueCommand extends Command {
    public static readonly KIND = DeleteLabelTypeValueAction.TYPE;

    @inject(EditorModeController)
    @optional()
    private readonly editorModeController?: EditorModeController;

    constructor(
        @inject(TYPES.Action) private action: DeleteLabelTypeValueAction,
        @inject(TYPES.ISnapper) private snapper: ISnapper,
    ) {
        super();
    }

    execute(context: CommandExecutionContext): CommandReturn {
        if (this.editorModeController?.isReadOnly()) {
            return context.root;
        }

        const labelType = this.action.registry.getLabelType(this.action.labelTypeId);
        if (!labelType) {
            return context.root;
        }

        const labelTypeValue = labelType.values.find((value) => value.id === this.action.labelTypeValueId);
        if (!labelTypeValue) {
            return context.root;
        }

        removeLabelsFromGraph(context.root, this.snapper, (label) => {
            return (
                label.labelTypeId !== this.action.labelTypeId || label.labelTypeValueId !== this.action.labelTypeValueId
            );
        });

        const index = labelType.values.indexOf(labelTypeValue);
        if (index > -1) {
            labelType.values.splice(index, 1);
            this.action.registry.labelTypeChanged();
        }

        return context.root;
    }

    undo(context: CommandExecutionContext): CommandReturn {
        return context.root;
    }

    redo(context: CommandExecutionContext): CommandReturn {
        return this.execute(context);
    }
}

export interface DeleteLabelTypeAction extends Action {
    kind: typeof DeleteLabelTypeAction.TYPE;
    registry: LabelTypeRegistry;
    labelTypeId: string;
}
export namespace DeleteLabelTypeAction {
    export const TYPE = "delete-label-type";
    export function create(registry: LabelTypeRegistry, labelTypeId: string): DeleteLabelTypeAction {
        return {
            kind: TYPE,
            registry,
            labelTypeId,
        };
    }
}

@injectable()
export class DeleteLabelTypeCommand extends Command {
    public static readonly KIND = DeleteLabelTypeAction.TYPE;

    @inject(EditorModeController)
    @optional()
    private readonly editorModeController?: EditorModeController;

    constructor(
        @inject(TYPES.Action) private action: DeleteLabelTypeAction,
        @inject(TYPES.ISnapper) private snapper: ISnapper,
    ) {
        super();
    }

    execute(context: CommandExecutionContext): CommandReturn {
        if (this.editorModeController?.isReadOnly()) {
            return context.root;
        }

        const labelType = this.action.registry.getLabelType(this.action.labelTypeId);
        if (!labelType) {
            return context.root;
        }

        removeLabelsFromGraph(context.root, this.snapper, (label) => label.labelTypeId !== this.action.labelTypeId);
        this.action.registry.unregisterLabelType(labelType);

        return context.root;
    }

    undo(context: CommandExecutionContext): CommandReturn {
        return context.root;
    }

    redo(context: CommandExecutionContext): CommandReturn {
        return this.execute(context);
    }
}

function getAllElements(elements: readonly SChildElementImpl[]): SModelElementImpl[] {
    const elementsList: SModelElementImpl[] = [];
    for (const element of elements) {
        elementsList.push(element);
        if ("children" in element) {
            elementsList.push(...getAllElements(element.children));
        }
    }
    return elementsList;
}
