import { inject, injectable } from "inversify";
import { ActionDispatcher, TYPES } from "sprotty";
import { ChangeEdgeLabelVisibilityAction, CompleteLayoutProcessAction, SimplifyNodeNamesAction } from "./actions";
import { LayoutMethod } from "./LayoutMethod";

@injectable()
export class SettingsManager {
    private _layoutMethod: LayoutMethod = LayoutMethod.LINES;
    private _layoutMethodSelect?: HTMLSelectElement;
    private _hideEdgeLabels = false;
    private _hideEdgeLabelsCheckbox?: HTMLInputElement;
    private _simplifyNodeNames = false;
    private _simplifyNodeNamesCheckbox?: HTMLInputElement;
    private static readonly layoutMethodLocalStorageKey = "settings";

    constructor(@inject(TYPES.IActionDispatcher) protected readonly dispatcher: ActionDispatcher) {
        this.layoutMethod = (localStorage.getItem(SettingsManager.layoutMethodLocalStorageKey) ??
            LayoutMethod.LINES) as LayoutMethod;
    }

    public get layoutMethod(): LayoutMethod {
        return this._layoutMethod;
    }

    public set layoutMethod(layoutMethod: LayoutMethod) {
        this._layoutMethod = layoutMethod;
        localStorage.setItem(SettingsManager.layoutMethodLocalStorageKey, layoutMethod);
        if (this._layoutMethodSelect) {
            this._layoutMethodSelect.value = layoutMethod;
        }
    }

    public bindLayoutMethodSelect(select: HTMLSelectElement) {
        this._layoutMethodSelect = select;
        this._layoutMethodSelect.value = this._layoutMethod;
        this._layoutMethodSelect.value = this._layoutMethod;
        this._layoutMethodSelect.addEventListener("change", () => {
            this.dispatcher.dispatch(
                CompleteLayoutProcessAction.create(this._layoutMethodSelect!.value as LayoutMethod),
            );
        });
    }

    public get hideEdgeLabels(): boolean {
        return this._hideEdgeLabels;
    }

    public set hideEdgeLabels(hideEdgeLabels: boolean) {
        this._hideEdgeLabels = hideEdgeLabels;
        if (this._hideEdgeLabelsCheckbox) {
            this._hideEdgeLabelsCheckbox.checked = hideEdgeLabels;
        }
    }

    public bindHideEdgeLabelsCheckbox(checkbox: HTMLInputElement) {
        this._hideEdgeLabelsCheckbox = checkbox;
        this._hideEdgeLabelsCheckbox.checked = this._hideEdgeLabels;
        this._hideEdgeLabelsCheckbox.addEventListener("change", () => {
            this.dispatcher.dispatch(ChangeEdgeLabelVisibilityAction.create(this._hideEdgeLabelsCheckbox!.checked));
        });
    }

    public get simplifyNodeNames(): boolean {
        return this._simplifyNodeNames;
    }

    public set simplifyNodeNames(simplifyNodeNames: boolean) {
        this._simplifyNodeNames = simplifyNodeNames;
        if (this._simplifyNodeNamesCheckbox) {
            this._simplifyNodeNamesCheckbox.checked = simplifyNodeNames;
        }
    }

    public bindSimplifyNodeNamesCheckbox(checkbox: HTMLInputElement) {
        this._simplifyNodeNamesCheckbox = checkbox;
        this._simplifyNodeNamesCheckbox.checked = this._simplifyNodeNames;
        this._simplifyNodeNamesCheckbox.addEventListener("change", () => {
            this.dispatcher.dispatch(
                SimplifyNodeNamesAction.create(this._simplifyNodeNamesCheckbox!.checked ? "hide" : "show"),
            );
        });
    }
}
