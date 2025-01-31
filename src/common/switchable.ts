export interface Switchable {
    switchTheme(useDark: boolean): void;
}

export const SWITCHABLE = Symbol("Switchable");
