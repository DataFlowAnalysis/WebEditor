import { TYPES, configureCommand } from "sprotty";
import { LoadDiagramCommand } from "./load";
import { SaveDiagramCommand } from "./save";
import { LoadDefaultDiagramCommand } from "./loadDefaultDiagram";
import { ContainerModule } from "inversify";
import { SerializeKeyListener } from "./keyListener";
import { SerializeDropHandler } from "./dropListener";
import { AnalyzeDiagramCommand } from "./analyze";
import { LoadDFDandDDCommand } from "./loadDFDandDD";
import { SaveDFDandDDCommand } from "./saveDFDandDD";
import { LoadPalladioCommand } from "./loadPalladio";

export const serializeModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    const context = { bind, unbind, isBound, rebind };
    configureCommand(context, LoadDiagramCommand);
    configureCommand(context, LoadDefaultDiagramCommand);
    configureCommand(context, SaveDiagramCommand);
    configureCommand(context, AnalyzeDiagramCommand);
    configureCommand(context, LoadDFDandDDCommand);
    configureCommand(context, SaveDFDandDDCommand);
    configureCommand(context, LoadPalladioCommand);

    bind(TYPES.KeyListener).to(SerializeKeyListener).inSingletonScope();
    bind(TYPES.MouseListener).to(SerializeDropHandler).inSingletonScope();
});
