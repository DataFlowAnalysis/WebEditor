import { injectable } from "inversify";
import "./constraintMenu.css";
import { AbstractUIExtension } from "sprotty";
import { calculateTextSize } from "../../utils";

@injectable()
export class ConstraintMenu extends AbstractUIExtension {
    static readonly ID = "constraint-menu";

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
        containerElement.appendChild(this.buildConstraintListWrapper(["Test123", "Test456", "Test789"]));
        containerElement.appendChild(this.buildRunButton());

        // Set the first item as selected
        setTimeout(() => this.selectConstraintListItem("Test123"), 0);
    }

    private buildConstraintInputWrapper(): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = "constraint-menu-input";
        wrapper.innerHTML = `
            <input type="text" id="constraint-input" placeholder="Enter constraint here">
        `;
        return wrapper;
    }

    private buildConstraintListWrapper(constrains: string[]): HTMLElement {
        const wrapper = document.createElement("div");
        wrapper.id = "constraint-menu-list";

        constrains.forEach((constraint) => {
            wrapper.appendChild(this.buildConstraintListItem(constraint));
        });

        return wrapper;
    }

    private buildConstraintListItem(constraint: string): HTMLElement {
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
        valueInput.value = constraint;
        valueInput.placeholder = "Name";
        this.dynamicallySetInputSize(valueInput);

        valueElement.appendChild(valueInput);

        const deleteButton = document.createElement("button");
        deleteButton.innerHTML = '<span class="codicon codicon-trash"></span>';
        deleteButton.onclick = () => {
            console.log("Delete button clicked");
        };
        valueElement.appendChild(deleteButton);
        return valueElement;
    }

    private selectConstraintListItem(constraint: string): void {
        const input = document.getElementById("constraint-input") as HTMLInputElement;
        input.value = constraint;
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
