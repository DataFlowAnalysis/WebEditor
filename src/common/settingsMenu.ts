import { AbstractUIExtension } from "sprotty";
import { inject, injectable } from "inversify";

import "./settingsMenu.css";

@injectable()
export class SettingsManager {
    public layoutMethod: LayoutMethod = LayoutMethod.LINES;
}

@injectable()
export class SettingsUI extends AbstractUIExtension {
    static readonly ID = "settings-ui";

    constructor(@inject(SettingsManager) protected readonly settings: SettingsManager) {
        super();
    }

    id(): string {
        return SettingsUI.ID;
    }

    containerClass(): string {
        return SettingsUI.ID;
    }

    protected initializeContents(containerElement: HTMLElement): void {
        containerElement.classList.add("ui-float");
        containerElement.innerHTML = `
            <input type="checkbox" id="accordion-state-settings" class="accordion-state" hidden>
            <label id="settings-ui-accordion-label" for="accordion-state-settings">
                <div class="accordion-button flip-arrow">
                    Settings
                </div>
            </label>
            <div class="accordion-content">
                <div id="settings-content">
                  <label for="setting-layout-option">Layout Method:</label>
                  <select name="setting-layout-option" id="setting-layout-option">
                    <option value="${LayoutMethod.LINES}">Lines</option>
                    <option value="${LayoutMethod.WRAPPING}">Wrapping Lines</option>
                    <option value="${LayoutMethod.CIRCLES}">Circles</option>
                  </select>
                </div>
            </div>
        `;

        // Set `settings-enabled` class on body element when keyboard shortcut overview is open.
        const checkbox = containerElement.querySelector("#accordion-state-settings") as HTMLInputElement;
        const bodyElement = document.querySelector("body") as HTMLBodyElement;
        checkbox.addEventListener("change", () => {
            if (checkbox.checked) {
                bodyElement.classList.add("settings-enabled");
            } else {
                bodyElement.classList.remove("settings-enabled");
            }
        });

        const layoutOptionSelect = containerElement.querySelector("#setting-layout-option") as HTMLSelectElement;
        layoutOptionSelect.addEventListener("change", () => {
            this.settings.layoutMethod = layoutOptionSelect.value as LayoutMethod;
        });
    }
}

export enum LayoutMethod {
    LINES = "Lines",
    WRAPPING = "Wrapping Lines",
    CIRCLES = "Circles",
}
