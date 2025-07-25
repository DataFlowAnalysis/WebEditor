import { inject, injectable } from "inversify";
import {
    AbstractUIExtension,
    IActionDispatcher,
    MouseListener,
    SChildElementImpl,
    SModelElementImpl,
    SModelRootImpl,
    SetUIExtensionVisibilityAction,
    TYPES,
} from "sprotty";
import { Action } from "sprotty-protocol";
import { DfdNodeImpl } from "./nodes";

import "@fortawesome/fontawesome-free/css/all.min.css";
import "./nodeAnnotationUi.css";
import { SettingsManager } from "../settingsMenu/SettingsManager";
import { Mode } from "../settingsMenu/annotationManager";

export class DfdNodeAnnotationUIMouseListener extends MouseListener {
    private stillTimeout: number | undefined;
    private lastPosition = { x: 0, y: 0 };

    constructor(@inject(TYPES.IActionDispatcher) private readonly actionDispatcher: IActionDispatcher) {
        super();
    }

    mouseMove(target: SModelElementImpl, event: MouseEvent): Action[] {
        const dfdNode = this.findDfdNode(target);
        if (!dfdNode) {
            if (this.stillTimeout) {
                clearTimeout(this.stillTimeout);
                this.stillTimeout = undefined;
            }
            return [];
        }

        if (this.lastPosition.x !== event.clientX || this.lastPosition.y !== event.clientY) {
            this.lastPosition = { x: event.clientX, y: event.clientY };
            // Mouse has moved, so we reset the timeout
            if (this.stillTimeout) {
                clearTimeout(this.stillTimeout);
            }
            this.stillTimeout = setTimeout(() => {
                // When the mouse has not moved for 500ms, we show the popup
                this.stillTimeout = undefined;

                if (dfdNode.opacity !== 1) {
                    // Only show when opacity is 1.
                    // The opacity is not 1 when the node is currently being created but has not been
                    // placed yet.
                    // In this case we don't want to show the popup
                    // and interfere with the creation process.
                    return;
                }

                this.showPopup(dfdNode);
            }, 500);
        }

        return [];
    }

    private findDfdNode(currentNode: SModelElementImpl): DfdNodeImpl | undefined {
        if (currentNode instanceof DfdNodeImpl) {
            return currentNode;
        } else if (currentNode instanceof SChildElementImpl && currentNode.parent) {
            return this.findDfdNode(currentNode.parent);
        } else {
            return undefined;
        }
    }

    private showPopup(target: DfdNodeImpl): void {
        if (!target.annotations) {
            // no annotation. No need to show the popup.
            return;
        }

        this.actionDispatcher.dispatch(
            SetUIExtensionVisibilityAction.create({
                extensionId: DfdNodeAnnotationUI.ID,
                visible: true,
                contextElementsId: [target.id],
            }),
        );
    }

    public getMousePosition(): { x: number; y: number } {
        return this.lastPosition;
    }
}

@injectable()
export class DfdNodeAnnotationUI extends AbstractUIExtension {
    static readonly ID = "dfd-node-annotation-ui";

    private readonly annotationParagraph = document.createElement("p") as HTMLParagraphElement;

    constructor(
        @inject(DfdNodeAnnotationUIMouseListener)
        private readonly mouseListener: DfdNodeAnnotationUIMouseListener,
        @inject(SettingsManager) private settings: SettingsManager,
    ) {
        super();
    }

    id(): string {
        return DfdNodeAnnotationUI.ID;
    }

    containerClass(): string {
        return this.id();
    }

    protected override initializeContents(containerElement: HTMLElement): void {
        containerElement.classList.add("ui-float");
        containerElement.appendChild(this.annotationParagraph);

        document.addEventListener("mousemove", (event) => {
            if (containerElement.style.visibility === "hidden") {
                // Not visible anyway, no need to do the check
                return;
            }

            // If mouse not in popup => hide
            const rect = containerElement.getBoundingClientRect();
            if (
                event.clientX < rect.left ||
                event.clientX > rect.right ||
                event.clientY < rect.top ||
                event.clientY > rect.bottom
            ) {
                this.hide();
            }
        });
    }

    protected override onBeforeShow(
        containerElement: HTMLElement,
        root: Readonly<SModelRootImpl>,
        ...contextElementIds: string[]
    ): void {
        if (contextElementIds.length !== 1) {
            this.annotationParagraph.innerText =
                "UI Error: Expected exactly one context element id, but got " + contextElementIds.length;
            return;
        }

        const node = root.index.getById(contextElementIds[0]);
        if (!(node instanceof DfdNodeImpl)) {
            this.annotationParagraph.innerText =
                "UI Error: Expected context element to be a DfdNodeImpl, but got " + node;
            return;
        }

        // Clear previous content
        this.annotationParagraph.innerText = "";

        // Set position
        // 2 offset to ensure the mouse is inside the popup when showing it.
        // Otherwise it would be on the node instead of the popup because of the rounded corners.
        // When moving the cursor from the node to the popup, the popup would move a bit
        // because the cursor is going a bit over the model and then the popup would re-show
        // with the new position after the timeout.
        const mousePosition = this.mouseListener.getMousePosition();
        const annotationPosition = {
            x: mousePosition.x - 2,
            y: mousePosition.y - 2,
        };
        containerElement.style.left = `${annotationPosition.x}px`;
        containerElement.style.top = `${annotationPosition.y}px`;

        // Set tooltip size and scroll to prevent them from growing out of the screen
        containerElement.style.overflowY = "auto";
        this.annotationParagraph.style.whiteSpace = "normal";
        this.annotationParagraph.style.wordBreak = "break-word";
        const screenWidth = window.innerWidth;
        const screenHeight = window.innerHeight;
        containerElement.style.maxWidth = `${Math.max(screenWidth - annotationPosition.x - 50, 100)}px`;
        containerElement.style.maxHeight = `${Math.max(screenHeight - annotationPosition.y - 50, 50)}px`;

        // Set content
        if (!node.annotations || node.annotations.length == 0) {
            this.annotationParagraph.innerText = "No errors";
            return;
        }

        this.annotationParagraph.innerHTML = "";

        const mode = this.settings.getCurrentLabelMode();

        node.annotations.forEach((a) => {
            if (
                ((mode === Mode.INCOMING || mode === Mode.ALL) && a.message.trim().startsWith("Incoming")) ||
                ((mode === Mode.OUTGOING || mode === Mode.ALL) && a.message.trim().startsWith("Propagated")) ||
                a.message.startsWith("Constraint")
            ) {
                const line = document.createElement("div");
                line.style.display = "flex";
                line.style.alignItems = "center";
                line.style.gap = "6px"; // some spacing between icon and text

                if (a.icon) {
                    const iconI = document.createElement("i");
                    iconI.classList.add("fa", `fa-${a.icon}`);
                    line.appendChild(iconI);
                }

                const textSpan = document.createElement("span");
                textSpan.innerText = a.message;
                line.appendChild(textSpan);

                this.annotationParagraph.appendChild(line);
            }
        });
    }
}
