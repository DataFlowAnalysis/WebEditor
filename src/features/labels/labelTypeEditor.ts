import { injectable, inject, optional } from "inversify";
import { calculateTextSize, generateRandomSprottyId } from "../../utils";
import {
    AbstractUIExtension,
    CommandStack,
    CommitModelAction,
    IActionDispatcher,
    ISnapper,
    KeyListener,
    SModelElementImpl,
    TYPES,
} from "sprotty";
import { LabelAssignment, LabelType, LabelTypeRegistry, LabelTypeValue } from "./labelTypeRegistry";
import { DeleteLabelTypeAction, DeleteLabelTypeValueAction } from "./commands";
import { LABEL_ASSIGNMENT_MIME_TYPE } from "./dropListener";
import { Action } from "sprotty-protocol";
import { snapPortsOfNode } from "../dfdElements/portSnapper";
import { DfdNodeImpl } from "../dfdElements/nodes";
import { matchesKeystroke } from "sprotty/lib/utils/keyboard";
import { EditorModeController } from "../editorMode/editorModeController";

import "../../common/commonStyling.css";
import "./labelTypeEditor.css";

@injectable()
export class LabelTypeEditorUI extends AbstractUIExtension implements KeyListener {
    private accordionStateElement: HTMLInputElement = document.createElement("input");

    constructor(
        @inject(LabelTypeRegistry) private readonly labelTypeRegistry: LabelTypeRegistry,
        @inject(TYPES.IActionDispatcher) private readonly actionDispatcher: IActionDispatcher,
        @inject(TYPES.ICommandStack) private readonly commandStack: CommandStack,
        @inject(TYPES.ISnapper) private readonly snapper: ISnapper,
        @inject(EditorModeController)
        @optional()
        private readonly editorModeController: EditorModeController,
    ) {
        super();
        labelTypeRegistry.onUpdate(() => this.reRender());

        this.accordionStateElement.type = "checkbox";
        this.accordionStateElement.id = "accordion-state-label-types";
        this.accordionStateElement.classList.add("accordion-state");
        this.accordionStateElement.hidden = true;
    }

    static readonly ID = "label-type-editor-ui";

    id(): string {
        return LabelTypeEditorUI.ID;
    }

    containerClass(): string {
        return LabelTypeEditorUI.ID;
    }

    private reRender(): void {
        if (!this.containerElement) {
            // The ui extension has not been initialized yet.
            return;
        }

        // Remove all children
        this.containerElement.innerHTML = "";
        // Re-render
        this.initializeContents(this.containerElement);

        // Re-render sprotty model viewport by dispatching some command.
        // sprotty automatically triggers a re-render after any command is executed as it may change the model.

        // CommitModelAction is a great idea because that way we don't have to call it
        // each time we do some operation on the model inside the UI, like when removing a label type,
        // we also need to commit the removal from the model.
        // We can just do it here and not worry about it in the buttons/change handlers inside the ui.
        // All changes are propagated through the label type registry.
        this.actionDispatcher.dispatch(CommitModelAction.create());
    }

    protected initializeContents(containerElement: HTMLElement): void {
        containerElement.classList.add("ui-float");
        containerElement.innerHTML = `
            <label for="accordion-state-label-types">
                <div class="accordion-button cevron-left" id="accordion-state-label-title">Label Types</div>
            </label>
            <div class="accordion-content">
                <div class="label-type-edit-ui-inner"></div>
            </div>
        `;
        // Add input used by the label and the accordion-content div
        // This element is not re-created on new renders and reused to save the expansion state of the accordion
        // This is important because the ui is re-rendered on every change to the label type registry
        containerElement.prepend(this.accordionStateElement);

        const innerContainerElement = containerElement.querySelector(".label-type-edit-ui-inner");
        if (!innerContainerElement) {
            throw new Error("Could not find inner container element");
        }

        this.labelTypeRegistry.getLabelTypes().forEach((labelType, idx) => {
            innerContainerElement.appendChild(this.renderLabelType(labelType));

            if (idx < this.labelTypeRegistry.getLabelTypes().length - 1) {
                // Add a horizontal line between label types
                const horizontalLine = document.createElement("hr");
                innerContainerElement.appendChild(horizontalLine);
            }
        });

        // Render add button for whole label type
        const addButton = document.createElement("button");
        addButton.innerHTML = '<span class="codicon codicon-add"></span> Label Type';
        addButton.onclick = () => {
            if (this.editorModeController?.isReadOnly()) {
                return;
            }

            const labelType: LabelType = {
                id: generateRandomSprottyId(),
                name: "",
                values: [
                    {
                        id: generateRandomSprottyId(),
                        text: "Value",
                    },
                ],
            };
            this.labelTypeRegistry.registerLabelType(labelType);

            // Select the text input element of the new label type to allow entering the name
            const inputElement: HTMLElement | null = innerContainerElement.querySelector(
                `.label-type-${labelType.id} input`,
            );
            inputElement?.focus();
        };
        innerContainerElement.appendChild(addButton);
    }

    private renderLabelType(labelType: LabelType): HTMLElement {
        const labelTypeElement = document.createElement("div");
        labelTypeElement.classList.add("label-type");
        labelTypeElement.classList.add(`label-type-${labelType.id}`);

        const labelTypeNameInput = document.createElement("input");
        labelTypeNameInput.value = labelType.name;
        labelTypeNameInput.placeholder = "Label Type Name";
        labelTypeNameInput.classList.add("label-type-name");

        this.dynamicallySetInputSize(labelTypeNameInput);

        // Disallow spaces in label type names and changes when readonly
        labelTypeNameInput.onbeforeinput = (event) => {
            if (event.data?.includes(" ")) {
                event.preventDefault();
            }

            if (this.editorModeController && this.editorModeController.isReadOnly()) {
                event.preventDefault();
            }
        };

        labelTypeNameInput.onchange = () => {
            const newLabelTypeName = labelTypeNameInput.value;
            // Check for duplicate and don't change the name if it is a duplicate
            if (this.labelTypeRegistry.getLabelTypes().some((type) => type.name === newLabelTypeName)) {
                // Undo change in UI
                labelTypeNameInput.value = labelType.name;
                return;
            }

            labelType.name = labelTypeNameInput.value;
            this.labelTypeRegistry.labelTypeChanged();
            this.reSnapPorts(labelType.id);
        };
        // Only allow alphanumerical characters
        labelTypeNameInput.oninput = this.onInputOnlyAlphanumeric;

        labelTypeElement.appendChild(labelTypeNameInput);

        const deleteButton = document.createElement("button");
        deleteButton.innerHTML = '<span class="codicon codicon-trash"></span>';
        deleteButton.onclick = () => {
            this.actionDispatcher.dispatch(DeleteLabelTypeAction.create(this.labelTypeRegistry, labelType.id));
        };
        labelTypeElement.appendChild(deleteButton);

        labelType.values.forEach((possibleValue) => {
            labelTypeElement.appendChild(this.renderLabelTypeValue(labelType, possibleValue));
        });

        // Add + button
        const addButton = document.createElement("button");
        addButton.classList.add("label-type-value-add");
        addButton.innerHTML = '<span class="codicon codicon-add"></span> Value';
        addButton.onclick = () => {
            if (this.editorModeController?.isReadOnly()) {
                return;
            }

            const labelValue: LabelTypeValue = {
                id: generateRandomSprottyId(),
                text: "",
            };
            labelType.values.push(labelValue);

            // Insert label type last but before the button
            const newValueElement = this.renderLabelTypeValue(labelType, labelValue);
            labelTypeElement.insertBefore(newValueElement, labelTypeElement.lastChild);

            // Select the text input element of the new value to allow entering the value
            newValueElement.querySelector("input")?.focus();
        };
        labelTypeElement.appendChild(addButton);

        return labelTypeElement;
    }

    private renderLabelTypeValue(labelType: LabelType, labelTypeValue: LabelTypeValue): HTMLElement {
        const valueElement = document.createElement("div");
        valueElement.classList.add("label-type-value");

        const valueInput = document.createElement("input");
        valueInput.value = labelTypeValue.text;
        valueInput.placeholder = "Value";
        this.dynamicallySetInputSize(valueInput);

        // Disallow spaces in label type values and changes when readonly
        valueInput.onbeforeinput = (event) => {
            if (event.data?.includes(" ")) {
                event.preventDefault();
            }

            if (this.editorModeController && this.editorModeController.isReadOnly()) {
                event.preventDefault();
            }
        };

        valueInput.onchange = () => {
            const newValue = valueInput.value;
            // Check for duplicate and don't change the value if it is a duplicate
            if (labelType.values.some((value) => value.text === newValue)) {
                // Undo change in UI
                valueInput.value = labelTypeValue.text;
                return;
            }

            labelTypeValue.text = valueInput.value;
            this.labelTypeRegistry.labelTypeChanged();
            this.reSnapPorts(labelType.id);
        };
        // Only allow alphanumerical characters
        valueInput.oninput = this.onInputOnlyAlphanumeric;

        // Allow dragging to create a label assignment
        valueInput.draggable = true;
        valueInput.ondragstart = (event) => {
            const assignment: LabelAssignment = {
                labelTypeId: labelType.id,
                labelTypeValueId: labelTypeValue.id,
            };
            const assignmentJson = JSON.stringify(assignment);
            event.dataTransfer?.setData(LABEL_ASSIGNMENT_MIME_TYPE, assignmentJson);
        };

        valueElement.appendChild(valueInput);

        const deleteButton = document.createElement("button");
        deleteButton.innerHTML = '<span class="codicon codicon-trash"></span>';
        deleteButton.onclick = () => {
            this.actionDispatcher.dispatch(
                DeleteLabelTypeValueAction.create(this.labelTypeRegistry, labelType.id, labelTypeValue.id),
            );
        };
        valueElement.appendChild(deleteButton);
        return valueElement;
    }

    /**
     * Sets and dynamically updates the size property of the passed input element.
     * When the text is zero the width is set to the placeholder length to make place for it.
     * When the text is changed the size gets updated with the keyup event.
     * @param inputElement the html dom input element to set the size property for
     */
    private dynamicallySetInputSize(inputElement: HTMLInputElement): void {
        const handleResize = () => {
            const displayText = inputElement.value || inputElement.placeholder;
            const { width } = calculateTextSize(displayText, window.getComputedStyle(inputElement).font);

            // Values have higher padding for the rounded border
            const widthPadding = inputElement.classList.contains("label-type-name") ? 2 : 8;
            const finalWidth = width + widthPadding;

            inputElement.style.width = finalWidth + "px";
        };

        inputElement.onkeyup = handleResize;

        // The inputElement is not added to the DOM yet, so we cannot set the size now.
        // Wait for next JS tick, after which the element has been added to the DOM and we can set the initial size
        setTimeout(handleResize, 0);
    }

    keyDown(_element: SModelElementImpl, event: KeyboardEvent): Action[] {
        // Toggle the accordion on press of T
        if (matchesKeystroke(event, "KeyT")) {
            this.accordionStateElement.checked = !this.accordionStateElement.checked;
        }

        return [];
    }

    keyUp(): Action[] {
        return [];
    }

    /**
     * Re-snaps the ports of all nodes that have a label of the changed label type.
     * When a label type or label type value is changed the size of nodes that
     * use that label type could be changed to fit the longer/shorter label text
     * more appropriately. Because of the node size change the ports may be out of
     * place and need to be re-snapped.
     *
     * This is called only for changes made by the UI because label type deletions
     * handle the resnapping in the corresponding commands and for addition
     * it is not necessary because the label type or value cannot be used already.
     */
    private async reSnapPorts(changedLabelTypeId: string): Promise<void> {
        const root = await this.commandStack.executeAll([]);
        root.children.forEach((node) => {
            if (!(node instanceof DfdNodeImpl)) {
                return;
            }

            // Only do the snapping if the node contains a label of the changed label type
            if (node.labels.some((labelAs) => labelAs.labelTypeId === changedLabelTypeId)) {
                snapPortsOfNode(node, this.snapper);
            }
        });

        // Commit the model to trigger a re-render and save the changes into the model source
        this.actionDispatcher.dispatch(CommitModelAction.create());
    }

    /**
     * onInput handler for inputs that restricts the input to only alphanumeric characters and underscores
     */
    private onInputOnlyAlphanumeric(event: Event): void {
        const input = event.target as HTMLInputElement;
        input.value = input.value.replace(/[^a-zA-Z0-9_]/g, "");
    }
}
