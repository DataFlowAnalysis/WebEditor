import { Action } from "sprotty-protocol";

export interface ChooseConstraintAction extends Action {
    kind: typeof ChooseConstraintAction.KIND;
    names: string[];
}

export namespace ChooseConstraintAction {
    export const KIND = "choose-constraint";

    export function create(names: string[]): ChooseConstraintAction {
        return { kind: KIND, names };
    }
}
