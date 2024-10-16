import { injectable } from "inversify";
import "./lightDarkSwitch.css";
import { AbstractUIExtension } from "sprotty";

@injectable()
export class LightDarkSwitch extends AbstractUIExtension {
    static readonly ID = "light-dark-switch";
    static useDarkMode = false;

    id(): string {
        return LightDarkSwitch.ID;
    }
    containerClass(): string {
        return LightDarkSwitch.ID;
    }
    protected initializeContents(containerElement: HTMLElement): void {
        containerElement.classList.add("ui-float");
        containerElement.innerHTML = `
          <input type="checkbox" id="light-dark-switch" hidden />
          <label id="light-dark-label" for="light-dark-switch">
            <div id="light-dark-button"></div>
          </label>
      `;

        const checkbox = containerElement.querySelector("#light-dark-switch") as HTMLInputElement;
        checkbox.addEventListener("change", () => {
            this.changeDarkMode(checkbox.checked);
        });

        // use the default browser theme
        if (window.matchMedia && window.matchMedia("(prefers-color-scheme: dark)").matches) {
            checkbox.checked = true;
            this.changeDarkMode(true);
        }
    }

    private changeDarkMode(useDark: boolean) {
        const rootElement = document.querySelector(":root") as HTMLElement;
        const sprottyElement = document.querySelector("#sprotty") as HTMLElement;

        const value = useDark ? "dark" : "light";
        rootElement.setAttribute("data-theme", value);
        sprottyElement.setAttribute("data-theme", value);
    }
}
