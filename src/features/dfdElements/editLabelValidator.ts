import { injectable } from "inversify";
import {
    EditLabelValidationResult,
    EditableLabel,
    IEditLabelValidationDecorator,
    IEditLabelValidator,
    SChildElementImpl,
    SEdgeImpl,
    SModelElementImpl,
} from "sprotty";
import { DfdInputPortImpl } from "./ports";
import { DfdNodeImpl } from "./nodes";

import "./editLabelValidator.css";

/**
 * Validator for the label of an dfd edge.
 * Ensures that the label of an dfd edge is unique within the node that the edge is connected to.
 * Does not do any validation if the label is not a child of an dfd edge.
 */
@injectable()
export class DfdEditLabelValidator implements IEditLabelValidator {
    async validate(value: string, label: EditableLabel & SModelElementImpl): Promise<EditLabelValidationResult> {
        // Check whether we have an dfd edge label and a non-empty label value
        if (!(label instanceof SChildElementImpl)) {
            return { severity: "ok" };
        }

        const labelParent = label.parent;
        if (!(labelParent instanceof SEdgeImpl)) {
            return { severity: "ok" };
        }

        // Labels on edges are not allowed to have spaces in them
        if (value.includes(" ")) {
            return { severity: "error", message: "Input name cannot contain spaces" };
        }

        // Labels on edges are not allowed to be empty
        if (value.length == 0) {
            return { severity: "error", message: "Input name cannot be empty" };
        }

        // Get node and edge names that are in use
        const edge = labelParent;
        const edgeTarget = edge.target;
        if (!(edgeTarget instanceof DfdInputPortImpl)) {
            return { severity: "ok" };
        }

        const inputPort = edgeTarget;
        const node = inputPort.parent as DfdNodeImpl;
        const usedEdgeNames = node.getEdgeTexts((e) => e.id !== edge.id); // filter out the edge we are currently editing

        // Check whether the label value is already used (case insensitive)
        if (usedEdgeNames.find((name) => name.toLowerCase() === value.toLowerCase())) {
            return { severity: "error", message: "Input name already used" };
        }

        return { severity: "ok" };
    }
}

/**
 * Renders the validation result of an dfd edge label to the label edit ui.
 */
@injectable()
export class DfdEditLabelValidatorDecorator implements IEditLabelValidationDecorator {
    private readonly cssClass = "label-validation-results";

    decorate(input: HTMLInputElement | HTMLTextAreaElement, validationResult: EditLabelValidationResult): void {
        const containerElement = input.parentElement;
        if (!containerElement) {
            return;
        }

        // Only display something when there is a validation error or warning
        if (validationResult.severity !== "ok") {
            const span = document.createElement("span");
            span.innerText = validationResult.message ?? validationResult.severity;
            span.classList.add(this.cssClass);

            // Place validation notice right under the input field
            span.style.top = `${input.clientHeight}px`;
            // Rest is styled in the corresponding css file, as it is not dynamic

            containerElement.appendChild(span);
        }
    }

    dispose(input: HTMLInputElement | HTMLTextAreaElement): void {
        const containerElement = input.parentElement;
        if (containerElement) {
            containerElement.querySelector(`span.${this.cssClass}`)?.remove();
        }
    }
}
