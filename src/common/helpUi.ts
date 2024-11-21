import { AbstractUIExtension } from "sprotty";
import { injectable } from "inversify";

import "./helpUi.css";

@injectable()
export class HelpUI extends AbstractUIExtension {
    static readonly ID = "help-ui";

    id(): string {
        return HelpUI.ID;
    }

    containerClass(): string {
        return HelpUI.ID;
    }

    protected initializeContents(containerElement: HTMLElement): void {
        containerElement.classList.add("ui-float");
        containerElement.innerHTML = `
            <input type="checkbox" id="accordion-state-help" class="accordion-state" hidden>
            <label id="help-ui-accordion-label" for="accordion-state-help">
                <div class="accordion-button flip-arrow">
                    Keyboard Shortcuts | Help
                </div>
            </label>
            <div class="accordion-content">
                <div>
                    <p><kbd>CTRL</kbd>+<kbd>Space</kbd>: Command Palette</p>
                    <p><kbd>CTRL</kbd>+<kbd>Z</kbd>: Undo</p>
                    <p><kbd>CTRL</kbd>+<kbd>Shift</kbd>+<kbd>Z</kbd>: Redo</p>
                    <p><kbd>Del</kbd>: Delete selected elements</p>
                    <p><kbd>T</kbd>: Toggle Label Type Edit UI</p>
                    <p><kbd>CTRL</kbd>+<kbd>O</kbd>: Load diagram from json</p>
                    <p><kbd>CTRL</kbd>+<kbd>Shift</kbd>+<kbd>O</kbd>: Open default diagram</p>
                    <p><kbd>CTRL</kbd>+<kbd>S</kbd>: Save diagram to json</p>
                    <p><kbd>CTRL</kbd>+<kbd>L</kbd>: Automatically layout diagram</p>
                    <p><kbd>CTRL</kbd>+<kbd>Shift</kbd>+<kbd>F</kbd>: Fit diagram to screen</p>
                    <p><kbd>CTRL</kbd>+<kbd>C</kbd>: Copy selected elements</p>
                    <p><kbd>CTRL</kbd>+<kbd>V</kbd>: Paste previously copied elements</p>
                    <p><kbd>Esc</kbd>: Disable current creation tool</p>
                    <p>Toggle Creation Tool: Refer to key in the tool palette</p>
                </div>
            </div>
        `;

        // Set `help-enabled` class on body element when keyboard shortcut overview is open.
        const checkbox = containerElement.querySelector("#accordion-state-help") as HTMLInputElement;
        const bodyElement = document.querySelector("body") as HTMLBodyElement;
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                bodyElement.classList.add("help-enabled");
            } else {
                bodyElement.classList.remove("help-enabled");
            }
        });
    }
}
