import { ContainerModule } from "inversify";
import { LabelTypeRegistry, globalLabelTypeRegistry } from "./labelTypeRegistry";
import { DfdNodeLabelRenderer } from "./labelRenderer";
import { EDITOR_TYPES } from "../../utils";
import { DfdLabelMouseDropListener } from "./dropListener";
import { LabelTypeEditorUI } from "./labelTypeEditor";
import { TYPES, configureCommand } from "sprotty";
import {
    AddLabelAssignmentCommand,
    DeleteLabelAssignmentCommand,
    DeleteLabelTypeCommand,
    DeleteLabelTypeValueCommand,
} from "./commands";

// This module contains the components required for the dfd node labels.
// This includes a registry for the label types, a UI to manage them,
// a renderer to display them inside nodes and commands to add/delete them to nodes.

export const dfdLabelModule = new ContainerModule((bind, unbind, isBound, rebind) => {
    bind(LabelTypeRegistry).toConstantValue(globalLabelTypeRegistry);
    bind(DfdNodeLabelRenderer).toSelf().inSingletonScope();
    bind(DfdLabelMouseDropListener).toSelf().inSingletonScope();
    bind(TYPES.MouseListener).toService(DfdLabelMouseDropListener);

    bind(LabelTypeEditorUI).toSelf().inSingletonScope();
    bind(TYPES.KeyListener).toService(LabelTypeEditorUI);
    bind(TYPES.IUIExtension).toService(LabelTypeEditorUI);
    bind(EDITOR_TYPES.DefaultUIElement).to(LabelTypeEditorUI);

    const context = { bind, unbind, isBound, rebind };
    configureCommand(context, AddLabelAssignmentCommand);
    configureCommand(context, DeleteLabelAssignmentCommand);
    configureCommand(context, DeleteLabelTypeValueCommand);
    configureCommand(context, DeleteLabelTypeCommand);
});
