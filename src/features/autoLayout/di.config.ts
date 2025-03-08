import { ContainerModule } from "inversify";
import { TYPES, configureCommand } from "sprotty";
import { ElkFactory, ILayoutConfigurator, ILayoutPostprocessor } from "sprotty-elk";
import { LayoutModelCommand } from "./command";
import { CircleLayoutPostProcessor, DfdElkLayoutEngine, DfdLayoutConfigurator, elkFactory } from "./layouter";
import { AutoLayoutKeyListener } from "./keyListener";

export const autoLayoutModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(DfdElkLayoutEngine).toSelf().inSingletonScope();
    bind(TYPES.IModelLayoutEngine).toService(DfdElkLayoutEngine);
    rebind(ILayoutConfigurator).to(DfdLayoutConfigurator);
    bind(ILayoutPostprocessor).to(CircleLayoutPostProcessor).inSingletonScope();
    bind(ElkFactory).toConstantValue(elkFactory);
    bind(TYPES.KeyListener).to(AutoLayoutKeyListener).inSingletonScope();

    const context = { bind, unbind, isBound, rebind };
    configureCommand(context, LayoutModelCommand);
});
