import { ContainerModule } from "inversify";
import {
    CenterGridSnapper,
    CenterKeyboardListener,
    ConsoleLogger,
    CreateElementCommand,
    LocalModelSource,
    LogLevel,
    TYPES,
    configureCommand,
    configureViewerOptions,
} from "sprotty";
import { ServerCommandPaletteActionProvider } from "./commandPalette";
import { HelpUI } from "./helpUi";
import { DeleteKeyListener } from "./deleteKeyListener";
import { EDITOR_TYPES } from "../utils";
import { DynamicChildrenProcessor } from "../features/dfdElements/dynamicChildren";
import { FitToScreenKeyListener as CenterDiagramKeyListener } from "./fitToScreenKeyListener";
import { DiagramModificationCommandStack } from "./customCommandStack";

import "./commonStyling.css";
import { SettingsManager, SettingsUI } from "./settingsMenu";
import { ThemeManager } from "./themeManager";

export const commonModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(ServerCommandPaletteActionProvider).toSelf().inSingletonScope();
    bind(TYPES.ICommandPaletteActionProvider).toService(ServerCommandPaletteActionProvider);

    bind(DeleteKeyListener).toSelf().inSingletonScope();
    bind(TYPES.KeyListener).toService(DeleteKeyListener);
    bind(CenterDiagramKeyListener).toSelf().inSingletonScope();
    rebind(CenterKeyboardListener).toService(CenterDiagramKeyListener);

    bind(HelpUI).toSelf().inSingletonScope();
    bind(TYPES.IUIExtension).toService(HelpUI);
    bind(EDITOR_TYPES.DefaultUIElement).toService(HelpUI);

    bind(SettingsManager).toSelf().inSingletonScope();
    bind(ThemeManager).toSelf().inSingletonScope();
    bind(SettingsUI).toSelf().inSingletonScope();
    bind(TYPES.IUIExtension).toService(SettingsUI);
    bind(EDITOR_TYPES.DefaultUIElement).toService(SettingsUI);

    bind(DynamicChildrenProcessor).toSelf().inSingletonScope();

    unbind(TYPES.ICommandStack);
    bind(TYPES.ICommandStack).to(DiagramModificationCommandStack).inSingletonScope();

    // Sprotty configuration
    bind(TYPES.ModelSource).to(LocalModelSource).inSingletonScope();
    rebind(TYPES.ILogger).to(ConsoleLogger).inSingletonScope();
    rebind(TYPES.LogLevel).toConstantValue(LogLevel.log);
    bind(TYPES.ISnapper).to(CenterGridSnapper);

    // For some reason the CreateElementAction and Command exist but in no sprotty module is the command registered, so we need to do this here.
    const context = { bind, unbind, isBound, rebind };
    configureCommand(context, CreateElementCommand);

    // Configure zoom limits
    // Without these you could zoom in/out to infinity by accident resulting in your diagram being "gone".
    // You can still get back to the diagram using the fit to screen action but these zoom limits prevents this from happening in the most cases.
    configureViewerOptions(context, {
        zoomLimits: { min: 0.05, max: 20 },
    });
});
