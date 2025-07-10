import { injectable, inject } from "inversify";
import { LabelAssignment } from "./labelTypeRegistry";
import { Action } from "sprotty-protocol";
import {
    SModelElementImpl,
    SChildElementImpl,
    MouseListener,
    CommitModelAction,
    ILogger,
    TYPES,
    SNodeImpl,
} from "sprotty";
import { AddLabelAssignmentAction } from "./commands";
import { getParentWithDfdLabels } from "./elementFeature";

export const LABEL_ASSIGNMENT_MIME_TYPE = "application/x-label-assignment";

/**
 * Mouse Listener that handles the drop of label assignments.
 * These can be started by dragging a label type value from the label type editor UI.
 * Adds the label to the element that the label value was dropped on.
 */
@injectable()
export class DfdLabelMouseDropListener extends MouseListener {
    constructor(@inject(TYPES.ILogger) private logger: ILogger) {
        super();
    }

    override dragOver(_target: SModelElementImpl, event: MouseEvent): Action[] {
        // Prevent the dragover prevent to indicated that the drop is possible
        // Check https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/dragover_event for more details
        event.preventDefault();
        return [];
    }

    override drop(target: SChildElementImpl, event: DragEvent): Action[] {
        const labelAssignmentJson = event.dataTransfer?.getData(LABEL_ASSIGNMENT_MIME_TYPE);
        if (!labelAssignmentJson) {
            return [];
        }

        const dfdLabelElement = getParentWithDfdLabels(target);
        if (!dfdLabelElement) {
            this.logger.info(
                this,
                "Aborted drop of label assignment because the target element nor the parent elements have the dfd label feature",
            );
            return [];
        }

        if (!(dfdLabelElement instanceof SNodeImpl)) {
            this.logger.info(this, "Aborted drop of label assignment because the target element is not a node");
            return [];
        }

        const labelAssignment = JSON.parse(labelAssignmentJson) as LabelAssignment;
        this.logger.info(this, "Adding label assignment to element", dfdLabelElement, labelAssignment);
        return [AddLabelAssignmentAction.create(labelAssignment, dfdLabelElement), CommitModelAction.create()];
    }
}
