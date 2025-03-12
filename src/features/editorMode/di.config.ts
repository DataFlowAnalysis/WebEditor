import { ContainerModule } from "inversify";
import { DeleteElementCommand, EditLabelMouseListener, TYPES, configureCommand } from "sprotty";
import { EditorModeController } from "./editorModeController";
import { EditorModeSwitchUi } from "./modeSwitchUi";
import { EDITOR_TYPES } from "../../utils";
import { EditorModeAwareDeleteElementCommand, EditorModeAwareEditLabelMouseListener } from "./sprottyHooks";
import { ChangeEditorModeCommand } from "./command";

export const editorModeModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    const context = { bind, unbind, isBound, rebind };

    bind(EditorModeController).toSelf().inSingletonScope();
    bind(EditorModeSwitchUi).toSelf().inSingletonScope();
    bind(TYPES.IUIExtension).toService(EditorModeSwitchUi);
    bind(EDITOR_TYPES.DefaultUIElement).toService(EditorModeSwitchUi);

    configureCommand(context, ChangeEditorModeCommand);

    // Sprotty hooks that hook into the edit label, move and edit module
    // to intercept model modifications to prevent them when the editor is in a read-only mode.
    rebind(EditLabelMouseListener).to(EditorModeAwareEditLabelMouseListener);
    rebind(DeleteElementCommand).to(EditorModeAwareDeleteElementCommand);
});
