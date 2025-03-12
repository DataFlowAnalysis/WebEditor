import { ContainerModule } from "inversify";
import { SettingsUI } from "./settingsMenu";
import { ThemeManager } from "./themeManager";
import { EDITOR_TYPES } from "../../utils";
import { configureCommand, TYPES } from "sprotty";
import {
    ChangeEdgeLabelVisibilityCommand,
    ChangeThemeCommand,
    CompleteLayoutProcessCommand,
    NodeNameReplacementRegistry,
    SimplifyNodeNamesCommand,
} from "./commands";
import { SettingsManager } from "./SettingsManager";

export const settingsModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(SettingsManager).toSelf().inSingletonScope();
    bind(NodeNameReplacementRegistry).toSelf().inSingletonScope();
    bind(ThemeManager).toSelf().inSingletonScope();
    bind(SettingsUI).toSelf().inSingletonScope();
    bind(TYPES.IUIExtension).toService(SettingsUI);
    bind(EDITOR_TYPES.DefaultUIElement).toService(SettingsUI);
    const context = { bind, unbind, isBound, rebind };

    configureCommand(context, SimplifyNodeNamesCommand);
    configureCommand(context, ChangeEdgeLabelVisibilityCommand);
    configureCommand(context, CompleteLayoutProcessCommand);
    configureCommand(context, ChangeThemeCommand);
});
