import { AbstractUIExtension, ActionDispatcher, CommitModelAction, LocalModelSource, TYPES } from "sprotty";
import { inject, injectable } from "inversify";

import "./settingsMenu.css";
import { Theme, ThemeManager } from "./themeManager";
import { LayoutModelAction } from "../features/autoLayout/command";
import { createDefaultFitToScreenAction } from "../utils";

@injectable()
export class SettingsManager {
    private _layoutMethod: LayoutMethod = LayoutMethod.LINES;
    private _hideEdgeLabels = false;

    public get layoutMethod(): LayoutMethod {
        return this._layoutMethod;
    }

    public set layoutMethod(layoutMethod: LayoutMethod) {
        this._layoutMethod = layoutMethod;
    }

    public get hideEdgeLabels(): boolean {
        return this._hideEdgeLabels;
    }

    public set hideEdgeLabels(hideEdgeLabels: boolean) {
        this._hideEdgeLabels = hideEdgeLabels;
    }
}

@injectable()
export class SettingsUI extends AbstractUIExtension {
    static readonly ID = "settings-ui";

    constructor(
        @inject(SettingsManager) protected readonly settings: SettingsManager,
        @inject(ThemeManager) protected readonly themeManager: ThemeManager,
        @inject(TYPES.IActionDispatcher) protected readonly dispatcher: ActionDispatcher,
        @inject(TYPES.ModelSource) protected readonly modelSource: LocalModelSource,
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
                  <label for="setting-hide-edge-labels">Hide Edge Labels</label>
                  <label class="switch">
                    <input type="checkbox" id="setting-hide-edge-labels">
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
        layoutOptionSelect.addEventListener("change", () => {
            this.settings.layoutMethod = layoutOptionSelect.value as LayoutMethod;
            this.dispatcher.dispatchAll([
                LayoutModelAction.create(),
                CommitModelAction.create(),
                createDefaultFitToScreenAction(this.modelSource.model),
            ]);
        });

        const themeOptionSelect = containerElement.querySelector("#setting-theme") as HTMLSelectElement;
        themeOptionSelect.addEventListener("change", () => {
            this.themeManager.theme = themeOptionSelect.value as Theme;
        });

        const hideEdgeLabelsCheckbox = containerElement.querySelector("#setting-hide-edge-labels") as HTMLInputElement;
        hideEdgeLabelsCheckbox.checked = this.settings.hideEdgeLabels;
        hideEdgeLabelsCheckbox.addEventListener("change", () => {
            this.settings.hideEdgeLabels = hideEdgeLabelsCheckbox.checked;
            this.dispatcher.dispatchAll([CommitModelAction.create()]);
        });
    }
}

export enum LayoutMethod {
    LINES = "Lines",
    WRAPPING = "Wrapping Lines",
    CIRCLES = "Circles",
}
