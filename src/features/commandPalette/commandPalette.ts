import { CommandPalette } from "sprotty";

export class CustomCommandPalette extends CommandPalette {
    protected initializeContents(containerElement: HTMLElement) {
        containerElement.style.position = "absolute";
        this.inputElement = document.createElement("input");
        this.inputElement.style.width = "100%";
        this.inputElement.addEventListener("keydown", (event) => this.hideIfEscapeEvent(event));
        this.inputElement.addEventListener("keydown", (event) => this.cylceIfInvokePaletteKey(event));
        this.inputElement.onblur = () => window.setTimeout(() => this.hide(), 200);
        const div = document.createElement("div");
        div.style.position = "absolute";
        div.style.top = "0px";
        div.style.left = "0px";
        div.style.width = "100%";
        div.innerHTML = "Type to search for commands...";
        div.style.color = "black";
        containerElement.appendChild(div);
        containerElement.appendChild(this.inputElement);
    }
}
