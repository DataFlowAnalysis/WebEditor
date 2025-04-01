import { AbstractUIExtension } from "sprotty";
import "./loadingIndicator.css";

export class LoadingIndicator extends AbstractUIExtension {
    static readonly ID = "loading-indicator";
    private loadingIndicatorWrapper: HTMLElement | undefined;
    private loadingIndicatorText: HTMLElement | undefined;

    id(): string {
        return LoadingIndicator.ID;
    }
    containerClass(): string {
        return LoadingIndicator.ID;
    }
    protected initializeContents(containerElement: HTMLElement): void {
        this.loadingIndicatorWrapper = document.createElement("div");
        this.loadingIndicatorWrapper.id = "loading-indicator-wrapper";
        this.loadingIndicatorWrapper.style.display = "none";

        const loadingIndicator = document.createElement("div");
        loadingIndicator.id = "turning-circle";
        this.loadingIndicatorWrapper.appendChild(loadingIndicator);

        this.loadingIndicatorText = document.createElement("div");
        this.loadingIndicatorText.id = "loading-indicator-text";
        this.loadingIndicatorWrapper.appendChild(this.loadingIndicatorText);

        containerElement.appendChild(this.loadingIndicatorWrapper);
    }

    public showIndicator(text?: string) {
        if (this.loadingIndicatorWrapper) {
            this.loadingIndicatorWrapper.style.display = "flex";
            if (this.loadingIndicatorText) {
                this.loadingIndicatorText.innerText = text || "Loading...";
            }
            this.loadingIndicatorWrapper.focus();
        }
    }

    public hideIndicator() {
        if (this.loadingIndicatorWrapper) {
            this.loadingIndicatorWrapper.style.display = "none";
        }
    }
}
