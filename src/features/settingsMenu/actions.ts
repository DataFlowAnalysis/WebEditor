import { Action } from "sprotty-protocol";
import { LayoutMethod } from "./LayoutMethod";
import { Theme } from "./themeManager";

export interface SimplifyNodeNamesAction extends Action {
    kind: typeof SimplifyNodeNamesAction.KIND;
    mode: SimplifyNodeNamesAction.Mode;
}
export namespace SimplifyNodeNamesAction {
    export const KIND = "simplify-node-names";
    export type Mode = "hide" | "show";

    export function create(mode?: SimplifyNodeNamesAction.Mode): SimplifyNodeNamesAction {
        return {
            kind: KIND,
            mode: mode ?? "hide",
        };
    }
}

export interface ChangeEdgeLabelVisibilityAction extends Action {
    kind: typeof ChangeEdgeLabelVisibilityAction.KIND;
    hide: boolean;
}
export namespace ChangeEdgeLabelVisibilityAction {
    export const KIND = "hide-edge-labels";

    export function create(hide: boolean = true): ChangeEdgeLabelVisibilityAction {
        return { kind: KIND, hide };
    }
}

export interface CompleteLayoutProcessAction extends Action {
    kind: typeof CompleteLayoutProcessAction.KIND;
    method: LayoutMethod;
}
export namespace CompleteLayoutProcessAction {
    export const KIND = "complete-layout-process";

    export function create(method: LayoutMethod): CompleteLayoutProcessAction {
        return { kind: KIND, method };
    }
}

export interface ChangeThemeAction extends Action {
    kind: typeof ChangeThemeAction.KIND;
    theme: Theme;
}
export namespace ChangeThemeAction {
    export const KIND = "change-theme";

    export function create(theme: Theme = Theme.SYSTEM_DEFAULT): ChangeThemeAction {
        return { kind: KIND, theme };
    }
}
