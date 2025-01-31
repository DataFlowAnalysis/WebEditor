import { ContainerModule } from "inversify";
import { EDITOR_TYPES } from "../../utils";
import { ConstraintMenu } from "./ConstraintMenu";
import { TYPES } from "sprotty";
import { ConstraintRegistry } from "./constraintRegistry";
import { SWITCHABLE } from "../../common/themeManager";

// This module contains an UI extension that adds a tool palette to the editor.
// This tool palette allows the user to create new nodes and edges.
// Additionally it contains the tools that are used to create the nodes and edges.

export const constraintMenuModule = new ContainerModule((bind) => {
    bind(ConstraintRegistry).toSelf().inSingletonScope();

    bind(ConstraintMenu).toSelf().inSingletonScope();
    bind(TYPES.IUIExtension).toService(ConstraintMenu);
    bind(EDITOR_TYPES.DefaultUIElement).toService(ConstraintMenu);
    bind(SWITCHABLE).toService(ConstraintMenu);
});
