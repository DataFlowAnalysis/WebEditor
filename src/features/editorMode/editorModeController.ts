import { injectable } from "inversify";

export type EditorMode = "edit" | "view" | "embed";

/**
 * Holds the current editor mode in a central place.
 * Used to get the current mode in places where it is used.
 *
 * Changes to the mode should be done using the ChangeEditorModeCommand
 * and not directly on this class when done interactively
 * for undo/redo support and actions that are done to the model
 * when the mode changes.
 */
@injectable()
export class EditorModeController {
    private mode: EditorMode = "edit";
    private modeChangeCallbacks: ((mode: EditorMode) => void)[] = [];

    getCurrentMode(): EditorMode {
        return this.mode;
    }

    setMode(mode: EditorMode) {
        this.mode = mode;

        this.modeChangeCallbacks.forEach((callback) => callback(mode));
    }

    setDefaultMode() {
        this.mode = "edit";
    }

    onModeChange(callback: (mode: EditorMode) => void) {
        this.modeChangeCallbacks.push(callback);
    }

    isReadOnly(): boolean {
        return this.mode !== "edit";
    }
}
