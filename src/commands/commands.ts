import { ContainerModule } from "inversify";
import { configureCommand } from "sprotty";
import { LogHelloCommand } from "./log-hello";

// Bundles all defined commands into a inversify module that can be loaded to make
// all commands available to sprotty.

export const commandsModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    const context = { bind, unbind, isBound, rebind };
    configureCommand(context, LogHelloCommand);
});
