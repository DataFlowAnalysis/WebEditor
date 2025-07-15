import { AbstractUIExtension, ActionDispatcher, TYPES } from "sprotty";
import { inject, injectable } from "inversify";

import "./settingsMenu.css";
import { Theme, ThemeManager } from "./themeManager";
import { SettingsManager } from "./SettingsManager";
import { LayoutMethod } from "./LayoutMethod";
import { EditorModeController } from "../editorMode/editorModeController";
import { ChangeEditorModeAction } from "../editorMode/command";
import { Mode } from "./annotationManager";

@injectable()
export class SettingsUI extends AbstractUIExtension {
    static readonly ID = "settings-ui";

    constructor(
        @inject(SettingsManager) protected readonly settings: SettingsManager,
        @inject(ThemeManager) protected readonly themeManager: ThemeManager,
        @inject(EditorModeController) private editorModeController: EditorModeController,
        @inject(TYPES.IActionDispatcher) protected readonly dispatcher: ActionDispatcher,
    ) {
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
                <div class="accordion-button cevron-right flip-arrow">
                    Settings
                </div>
            </label>
            <div class="accordion-content">
                <div id="settings-content">
                    <label for="setting-theme">Theme</label>
                  <select name="setting-theme" id="setting-theme">
                    <option value="${Theme.SYSTEM_DEFAULT}">System default</option>
                    <option value="${Theme.LIGHT}">Light</option>
                    <option value="${Theme.DARK}">Dark</option>
                  </select>
                  <label for="setting-layout-option">Layout Method</label>
                  <select name="setting-layout-option" id="setting-layout-option">
                    <option value="${LayoutMethod.LINES}">Lines</option>
                    <option value="${LayoutMethod.WRAPPING}">Wrapping Lines</option>
                    <option value="${LayoutMethod.CIRCLES}">Circles</option>
                  </select>
                  <label for="setting-mode-option">Show Labels</label>
                  <select name="setting-mode-option" id="setting-mode-option">
                    <option value="${Mode.OUTGOING}">Outgoing Labels</option>
                    <option value="${Mode.INCOMING}">Incoming Labels</option>
                    <option value="${Mode.ALL}">All Labels</option>
                  </select>

                  <label for="setting-hide-edge-labels">Hide Edge Labels</label>
                  <label class="switch">
                    <input type="checkbox" id="setting-hide-edge-labels">
                    <span class="slider round"></span>
                  </label>

                  <label for="setting-simplify-node-names">Simplify Node Names</label>
                  <label class="switch">
                    <input type="checkbox" id="setting-simplify-node-names">
                    <span class="slider round"></span>
                  </label>

                  <label for="setting-read-only">Read only</label>
                  <label class="switch">
                    <input type="checkbox" id="setting-read-only">
                    <span class="slider round"></span>
                  </label>
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
        this.settings.bindLayoutMethodSelect(layoutOptionSelect);

        const themeOptionSelect = containerElement.querySelector("#setting-theme") as HTMLSelectElement;
        this.themeManager.bindThemeSelect(themeOptionSelect);

        const hideEdgeLabelsCheckbox = containerElement.querySelector("#setting-hide-edge-labels") as HTMLInputElement;
        this.settings.bindHideEdgeLabelsCheckbox(hideEdgeLabelsCheckbox);

        const simplifyNodeNamesCheckbox = containerElement.querySelector(
            "#setting-simplify-node-names",
        ) as HTMLInputElement;
        this.settings.bindSimplifyNodeNamesCheckbox(simplifyNodeNamesCheckbox);

        const readOnlyCheckbox = containerElement.querySelector("#setting-read-only") as HTMLInputElement;
        this.editorModeController.onModeChange((mode) => {
            readOnlyCheckbox.checked = mode !== "edit";
        });
        if (this.editorModeController.isReadOnly()) {
            readOnlyCheckbox.checked = true;
        }
        readOnlyCheckbox.addEventListener("change", () => {
            this.dispatcher.dispatch(ChangeEditorModeAction.create(readOnlyCheckbox.checked ? "view" : "edit"));
        });

        const modeSelect = containerElement.querySelector("#setting-mode-option") as HTMLSelectElement;
        modeSelect.value = Mode.INCOMING;
    }

    public getCurrentLabelMode(): Mode {
        const modeSelect = document.getElementById("setting-mode-option") as HTMLSelectElement;
        return modeSelect.value as Mode;
    }
}
