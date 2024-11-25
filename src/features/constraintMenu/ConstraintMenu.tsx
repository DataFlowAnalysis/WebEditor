import { inject, injectable } from "inversify";
import "./constraintMenu.css";
import { AbstractUIExtension } from "sprotty";
import { calculateTextSize, generateRandomSprottyId } from "../../utils";
import { Constraint, ConstraintRegistry } from "./constraintRegistry";

@injectable()
export class ConstraintMenu extends AbstractUIExtension {
    static readonly ID = "constraint-menu";
    private selectedConstraint: Constraint | undefined;

    constructor(@inject(ConstraintRegistry) private readonly constraintRegistry: ConstraintRegistry) {
        super();
        this.constraintRegistry = constraintRegistry;
    }

    id(): string {
        return ConstraintMenu.ID;
    }
    containerClass(): string {
        return ConstraintMenu.ID;
    }
    protected initializeContents(containerElement: HTMLElement): void {
        containerElement.classList.add("ui-float");
        containerElement.innerHTML = `
            <input type="checkbox" id="expand-state-constraint" hidden>
            <label id="constraint-menu-expand-label" for="expand-state-constraint">
                <div class="expand-button">
                    Constraints
                </div>
            </label>
        `;
        containerElement.appendChild(this.buildConstraintInputWrapper());
        containerElement.appendChild(this.buildConstraintListWrapper());
        containerElement.appendChild(this.buildRunButton());
    }

    private buildConstraintInputWrapper(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = "constraint-menu-input";
        wrapper.innerHTML = `
            <input type="text" id="constraint-input" placeholder="Enter constraint here">
        `;
        return wrapper;
    }

    private buildConstraintListWrapper(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = "constraint-menu-list";

        this.rerenderConstraintList(wrapper);

        return wrapper;
    }

    private buildConstraintListItem(constraint: Constraint): HTMLElement {
        const valueElement = document.createElement("div");
        valueElement.classList.add("constrain-label");

        valueElement.onclick = () => {
            const elements = document.getElementsByClassName("constraint-label");
            for (let i = 0; i < elements.length; i++) {
                elements[i].classList.remove("selected");
            }
            valueElement.classList.add("selected");
            this.selectConstraintListItem(constraint);
        };

        const valueInput = document.createElement("input");
        valueInput.value = constraint.name;
        valueInput.placeholder = "Name";
        this.dynamicallySetInputSize(valueInput);
        valueInput.onchange = () => {
            constraint.name = valueInput.value;
            this.constraintRegistry.constraintChanged();
        };

        valueElement.appendChild(valueInput);

        const deleteButton = document.createElement("button");
        deleteButton.innerHTML = '<span class="codicon codicon-trash"></span>';
        deleteButton.onclick = () => {
            this.constraintRegistry.unregisterConstraint(constraint);
            this.rerenderConstraintList();
            if (this.selectedConstraint === constraint) {
                this.selectConstraintListItem(undefined);
            }
        };
        valueElement.appendChild(deleteButton);
        return valueElement;
    }

    private selectConstraintListItem(constraint?: Constraint): void {
        this.selectedConstraint = constraint;
        const input = document.getElementById("constraint-input") as HTMLInputElement;
        input.value = constraint?.constraint ?? "";
    }

    private rerenderConstraintList(list?: HTMLElement): void {
        if (!list) {
            list = document.getElementById("constraint-menu-list") ?? undefined;
        }
        console.info(list);
        if (!list) return;
        list.innerHTML = "";
        this.constraintRegistry.getConstraints().forEach((constraint) => {
            list.appendChild(this.buildConstraintListItem(constraint));
        });

        const addButton = document.createElement("button");
        addButton.classList.add("constraint-add");
        addButton.innerHTML = '<span class="codicon codicon-add"></span> Constraint';
        addButton.onclick = () => {
            /*if (this.editorModeController?.isReadOnly()) {
                return;
            }*/

            const constraint: Constraint = {
                id: generateRandomSprottyId(),
                name: "",
                constraint: "" + Math.floor(Math.random() * 100),
            };
            this.constraintRegistry.registerConstraint(constraint);

            // Insert label type last but before the button
            const newValueElement = this.buildConstraintListItem(constraint);
            list.insertBefore(newValueElement, list.lastChild);
            this.selectConstraintListItem(constraint);

            // Select the text input element of the new value to allow entering the value
            newValueElement.querySelector("input")?.focus();
        };
        list.appendChild(addButton);
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
            const widthPadding = 8;
            const finalWidth = width + widthPadding;

            inputElement.style.width = finalWidth + "px";
        };

        inputElement.onkeyup = handleResize;

        // The inputElement is not added to the DOM yet, so we cannot set the size now.
        // Wait for next JS tick, after which the element has been added to the DOM and we can set the initial size
        setTimeout(handleResize, 0);
    }

    private buildRunButton(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = "run-button-container";

        const button = document.createElement("button");
        button.id = "run-button";
        button.innerHTML = "Run";
        button.onclick = () => {
            console.log("Run button clicked");
        };

        wrapper.appendChild(button);
        return wrapper;
    }
}
