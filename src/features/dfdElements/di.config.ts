import { ContainerModule } from "inversify";
import {
    SGraphImpl,
    SGraphView,
    SLabelImpl,
    configureModelElement,
    editLabelFeature,
    withEditLabelFeature,
    SLabelView,
    SRoutingHandleImpl,
    TYPES,
    configureCommand,
} from "sprotty";
import { FunctionNodeImpl, FunctionNodeView, IONodeImpl, IONodeView, StorageNodeImpl, StorageNodeView } from "./nodes";
import { ArrowEdgeImpl, ArrowEdgeView, CustomRoutingHandleView } from "./edges";
import { DfdInputPortImpl, DfdInputPortView, DfdOutputPortImpl, DfdOutputPortView } from "./ports";
import { FilledBackgroundLabelView, DfdPositionalLabelView } from "./labels";
import { AlwaysSnapPortsMoveMouseListener, ReSnapPortsAfterLabelChangeCommand, PortAwareSnapper } from "./portSnapper";
import { OutputPortEditUIMouseListener, OutputPortEditUI, SetDfdOutputPortBehaviorCommand } from "./outputPortEditUi";
import { DfdEditLabelValidator, DfdEditLabelValidatorDecorator } from "./editLabelValidator";
import { PortBehaviorValidator } from "./outputPortBehaviorValidation";
import { DfdNodeAnnotationUI, DfdNodeAnnotationUIMouseListener } from "./nodeAnnotationUi";
import { DFDBehaviorRefactorer, RefactorInputNameInDFDBehaviorCommand } from "./behaviorRefactorer";

import "./elementStyles.css";
import { SWITCHABLE } from "../settingsMenu/themeManager";

export const dfdElementsModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    const context = { bind, unbind, isBound, rebind };

    rebind(TYPES.ISnapper).to(PortAwareSnapper).inSingletonScope();
    bind(TYPES.MouseListener).to(AlwaysSnapPortsMoveMouseListener).inSingletonScope();
    configureCommand(context, ReSnapPortsAfterLabelChangeCommand);

    bind(PortBehaviorValidator).toSelf().inSingletonScope();

    bind(OutputPortEditUI).toSelf().inSingletonScope();
    bind(TYPES.IUIExtension).toService(OutputPortEditUI);
    bind(SWITCHABLE).toService(OutputPortEditUI);

    bind(TYPES.MouseListener).to(OutputPortEditUIMouseListener).inSingletonScope();
    configureCommand(context, SetDfdOutputPortBehaviorCommand);

    bind(TYPES.IEditLabelValidator).to(DfdEditLabelValidator).inSingletonScope();
    bind(TYPES.IEditLabelValidationDecorator).to(DfdEditLabelValidatorDecorator).inSingletonScope();

    bind(DfdNodeAnnotationUIMouseListener).toSelf().inSingletonScope();
    bind(TYPES.MouseListener).toService(DfdNodeAnnotationUIMouseListener);
    bind(TYPES.IUIExtension).to(DfdNodeAnnotationUI).inSingletonScope();

    bind(DFDBehaviorRefactorer).toSelf().inSingletonScope();
    configureCommand(context, RefactorInputNameInDFDBehaviorCommand);

    configureModelElement(context, "graph", SGraphImpl, SGraphView);
    configureModelElement(context, "node:storage", StorageNodeImpl, StorageNodeView);
    configureModelElement(context, "node:function", FunctionNodeImpl, FunctionNodeView);
    configureModelElement(context, "node:input-output", IONodeImpl, IONodeView);
    configureModelElement(context, "edge:arrow", ArrowEdgeImpl, ArrowEdgeView, {
        enable: [withEditLabelFeature],
    });
    configureModelElement(context, "label", SLabelImpl, SLabelView, {
        enable: [editLabelFeature],
    });
    configureModelElement(context, "label:filled-background", SLabelImpl, FilledBackgroundLabelView, {
        enable: [editLabelFeature],
    });
    configureModelElement(context, "label:positional", SLabelImpl, DfdPositionalLabelView, {
        enable: [editLabelFeature],
    });
    configureModelElement(context, "port:dfd-input", DfdInputPortImpl, DfdInputPortView);
    configureModelElement(context, "port:dfd-output", DfdOutputPortImpl, DfdOutputPortView);
    configureModelElement(context, "routing-point", SRoutingHandleImpl, CustomRoutingHandleView);
    configureModelElement(context, "volatile-routing-point", SRoutingHandleImpl, CustomRoutingHandleView);
});
