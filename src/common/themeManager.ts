import { injectable, multiInject } from "inversify";

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

    constructor(@multiInject(SWITCHABLE) protected switchables: Switchable[]) {
        this.theme = ThemeManager.SYSTEM_DEFAULT;
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

    set theme(theme: Theme) {
        ThemeManager._theme = theme;

        const rootElement = document.querySelector(":root") as HTMLElement;
        const sprottyElement = document.querySelector("#sprotty") as HTMLElement;

        const value = this.useDarkMode ? "dark" : "light";
        rootElement.setAttribute("data-theme", value);
        sprottyElement.setAttribute("data-theme", value);

        this.switchables.forEach((s) => s.switchTheme(this.useDarkMode));
    }
}
