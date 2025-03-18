import { AbstractUIExtension } from "sprotty";
import { EditorMode, EditorModeController } from "./editorModeController";
import { inject, injectable } from "inversify";

import "./modeSwitchUi.css";

/**
 * UI that shows the current editor mode (unless it is edit mode)
 * with details about the mode.
 */
@injectable()
export class EditorModeSwitchUi extends AbstractUIExtension {
    static readonly ID = "editor-mode-switcher";

    constructor(
        @inject(EditorModeController)
        private readonly editorModeController: EditorModeController,
    ) {
        super();
    }

    id(): string {
        return EditorModeSwitchUi.ID;
    }
    containerClass(): string {
        return this.id();
    }

    protected initializeContents(containerElement: HTMLElement): void {
        containerElement.classList.add("ui-float");
        containerElement.style.visibility = "hidden";
        this.editorModeController.onModeChange((mode) => this.reRender(mode));
        this.reRender(this.editorModeController.getCurrentMode());
    }

    private reRender(mode: EditorMode): void {
        this.containerElement.innerHTML = "";
        switch (mode) {
            case "edit":
                this.containerElement.style.visibility = "hidden";
                break;
            case "view":
                this.containerElement.style.visibility = "visible";
                this.renderViewMode();
                break;
            default:
                throw new Error(`Unknown editor mode: ${mode}`);
        }
    }

    private renderViewMode(): void {
        this.containerElement.innerHTML = `
            Currently viewing model in read only mode.</br>
            Enabling editing will remove the annotations.</br>
        `;
    }
}
