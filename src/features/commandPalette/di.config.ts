import { ContainerModule } from "inversify";
import { CommandPalette, TYPES } from "sprotty";
import { ServerCommandPaletteActionProvider } from "./commandPaletteProvider";
import { CustomCommandPalette } from "./commandPalette";
import "./commandPalette.css";

export const commandPaletteModule = new ContainerModule((bind, _, __, rebind) => {
    rebind(CommandPalette).to(CustomCommandPalette).inSingletonScope();

    bind(ServerCommandPaletteActionProvider).toSelf().inSingletonScope();
    bind(TYPES.ICommandPaletteActionProvider).toService(ServerCommandPaletteActionProvider);
});
