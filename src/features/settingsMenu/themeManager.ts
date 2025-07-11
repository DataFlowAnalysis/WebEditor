import { inject, injectable, multiInject } from "inversify";
import { ActionDispatcher, TYPES } from "sprotty";
import { ChangeThemeAction } from "./actions";

export enum Theme {
    LIGHT = "Light",
    DARK = "Dark",
    SYSTEM_DEFAULT = "System Default",
}

export const SWITCHABLE = Symbol("Switchable");

export interface Switchable {
    switchTheme(useDark: boolean): void;
}

@injectable()
export class ThemeManager {
    private static _theme: Theme = Theme.SYSTEM_DEFAULT;
    private static SYSTEM_DEFAULT =
        window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches ? Theme.DARK : Theme.LIGHT;
    private themeSelect?: HTMLSelectElement;
    private static readonly localStorageKey = "dfdwebeditor:theme";

    constructor(
        @multiInject(SWITCHABLE) protected switchables: Switchable[],
        @inject(TYPES.IActionDispatcher) protected readonly dispatcher: ActionDispatcher,
    ) {
        this.theme = (localStorage.getItem(ThemeManager.localStorageKey) ?? ThemeManager.SYSTEM_DEFAULT) as Theme;
    }

    get useDarkMode(): boolean {
        return ThemeManager.useDarkMode;
    }

    static get useDarkMode(): boolean {
        if (ThemeManager._theme == Theme.SYSTEM_DEFAULT) {
            return ThemeManager.SYSTEM_DEFAULT == Theme.DARK;
        }
        return ThemeManager._theme == Theme.DARK;
    }

    get theme(): Theme {
        return ThemeManager._theme;
    }

    set theme(theme: Theme) {
        ThemeManager._theme = theme;
        if (this.themeSelect) {
            this.themeSelect.value = theme;
        }

        const rootElement = document.querySelector(":root") as HTMLElement;
        const sprottyElement = document.querySelector("#sprotty") as HTMLElement;

        const value = this.useDarkMode ? "dark" : "light";
        rootElement.setAttribute("data-theme", value);
        sprottyElement.setAttribute("data-theme", value);
        localStorage.setItem(ThemeManager.localStorageKey, theme);

        this.switchables.forEach((s) => s.switchTheme(this.useDarkMode));
    }

    bindThemeSelect(themeSelect: HTMLSelectElement) {
        this.themeSelect = themeSelect;
        this.themeSelect.value = this.theme;
        this.themeSelect.addEventListener("change", () => {
            this.dispatcher.dispatch(ChangeThemeAction.create(themeSelect.value as Theme));
        });
    }
}
