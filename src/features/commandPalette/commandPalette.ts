import { injectable } from "inversify";
import { CommandPalette, LabeledAction, SModelRootImpl } from "sprotty";
import { matchesKeystroke } from "sprotty/lib/utils/keyboard";
import { FolderAction } from "./commandPaletteProvider";
import "./commandPalette.css";

@injectable()
export class CustomCommandPalette extends CommandPalette {
    static readonly ID = "command-palette";

    protected suggestionElement?: HTMLElement;
    protected index = -1;
    protected childIndex = -1;
    protected insideChild = false;
    protected actions: (LabeledAction | FolderAction)[] = [];
    protected filteredActions: (LabeledAction | FolderAction)[] = [];

    protected initializeContents(containerElement: HTMLElement) {
        containerElement.style.position = "absolute";
        containerElement.style.top = "100px";
        containerElement.style.left = "100px";
        this.inputElement = document.createElement("input");
        this.inputElement.style.width = "100%";
        this.inputElement.addEventListener("keydown", (event) => this.processKeyStrokeInInput(event));
        this.inputElement.addEventListener("input", () => this.updateSuggestions());
        this.inputElement.onblur = () => window.setTimeout(() => this.hide(), 200);
        this.suggestionElement = document.createElement("div");
        this.suggestionElement.className = "command-palette-suggestions-holder";
        containerElement.appendChild(this.inputElement);
        containerElement.appendChild(this.suggestionElement);
    }

    override show(root: Readonly<SModelRootImpl>, ...contextElementIds: string[]) {
        super.show(root, ...contextElementIds);
        this.autoCompleteResult.destroy();
        this.index = -1;
        this.childIndex = -1;
        this.insideChild = false;
        this.filteredActions = [];
        this.actions = [];
        this.suggestionElement!.innerHTML = "";
        this.inputElement!.value = "";
        this.inputElement!.focus();
        this.actionProviderRegistry
            .getActions(root, "", this.mousePositionTracker.lastPositionOnDiagram)
            .then((actions) => (this.actions = actions))
            .then(() => this.updateSuggestions());
    }

    protected updateSuggestions() {
        if (!this.suggestionElement) {
            return;
        }
        this.suggestionElement!.innerHTML = "";
        const searchText = this.inputElement!.value.toLowerCase();
        this.filteredActions = this.actions.filter((action) => {
            if (action instanceof FolderAction) {
                for (const childAction of action.children) {
                    if (this.matchFilter(childAction, searchText)) {
                        return true;
                    }
                }
            }
            return this.matchFilter(action, searchText);
        });
        if (this.index >= this.filteredActions.length) {
            this.index = -1;
        }
        for (const [idx, action] of this.filteredActions.entries()) {
            const suggestion = this.renderSuggestion(action);
            if (idx === this.index) {
                suggestion.classList.add("expanded");
                if (!this.insideChild) {
                    suggestion.classList.add("selected");
                }
            }
            this.suggestionElement!.appendChild(suggestion);
        }
    }

    private renderSuggestion(action: LabeledAction | FolderAction) {
        const suggestion = document.createElement("div");
        suggestion.className = "command-palette-suggestion";
        const icon = document.createElement("span");
        icon.className = this.getIconClasses(action.icon);
        suggestion.appendChild(icon);
        const label = document.createElement("span");
        label.className = "command-palette-suggestion-label";
        label.innerText = action.label;
        suggestion.appendChild(label);
        const arrow = document.createElement("span");
        suggestion.appendChild(arrow);
        if (action instanceof FolderAction) {
            arrow.className = "codicon codicon-chevron-right";
            suggestion.appendChild(arrow);
            const childHolder = document.createElement("div");
            childHolder.className = "command-palette-suggestion-children";
            for (const [idx, childAction] of action.children.entries()) {
                const childSuggestion = this.renderSuggestion(childAction);
                if (this.insideChild && this.childIndex === idx) {
                    childSuggestion.classList.add("selected");
                }
                childHolder.appendChild(childSuggestion);
            }
            suggestion.appendChild(childHolder);
        }
        suggestion.addEventListener("click", () => {
            if (!(action instanceof FolderAction)) {
                this.executeAction(action);
            }
        });
        return suggestion;
    }

    private getIconClasses(icon?: string) {
        if (!icon) {
            return "codicon codicon-gear";
        }
        if (icon.startsWith("fa-")) {
            return "fa-solid " + icon;
        }
        if (icon.startsWith("codicon-")) {
            return "codicon " + icon;
        }
        return "codicon codicon-" + icon;
    }

    private matchFilter(action: LabeledAction, searchText: string): boolean {
        return action.label.toLowerCase().includes(searchText);
    }

    id(): string {
        return CustomCommandPalette.ID;
    }
    containerClass(): string {
        return CustomCommandPalette.ID;
    }

    protected processKeyStrokeInInput(event: KeyboardEvent) {
        if (matchesKeystroke(event, "Escape")) {
            this.hide();
        }

        if (matchesKeystroke(event, "ArrowDown")) {
            if (this.insideChild) {
                this.childIndex =
                    (this.childIndex + 1) % (this.filteredActions[this.index] as FolderAction).children.length;
            } else {
                if (this.index === -1) {
                    this.index = 0;
                } else {
                    this.index = (this.index + 1) % this.suggestionElement!.children.length;
                }
            }
        }
        if (matchesKeystroke(event, "ArrowUp")) {
            if (this.insideChild) {
                this.childIndex =
                    (this.childIndex - 1 + (this.filteredActions[this.index] as FolderAction).children.length) %
                    (this.filteredActions[this.index] as FolderAction).children.length;
            } else {
                if (this.index === -1) {
                    this.index = this.suggestionElement!.children.length - 1;
                } else {
                    this.index =
                        (this.index - 1 + this.suggestionElement!.children.length) %
                        this.suggestionElement!.children.length;
                }
            }
        }
        if (matchesKeystroke(event, "ArrowRight")) {
            if (!this.insideChild && this.filteredActions[this.index] instanceof FolderAction) {
                event.preventDefault();
                this.insideChild = true;
                this.childIndex = 0;
            }
        }
        if (matchesKeystroke(event, "ArrowLeft")) {
            if (this.insideChild) {
                event.preventDefault();
                this.insideChild = false;
                this.childIndex = -1;
            }
        }
        if (matchesKeystroke(event, "Enter")) {
            if (this.insideChild) {
                this.executeAction((this.filteredActions[this.index] as FolderAction).children[this.childIndex]);
            } else {
                if (this.index !== -1) {
                    this.executeAction(this.filteredActions[this.index]);
                }
            }
            this.hide();
        }
        this.updateSuggestions();
    }

    protected executeAction(input: LabeledAction) {
        this.actionDispatcherProvider()
            .then((actionDispatcher) => actionDispatcher.dispatchAll(input.actions))
            .catch((reason) =>
                this.logger.error(this, "No action dispatcher available to execute command palette action", reason),
            );
    }
}
