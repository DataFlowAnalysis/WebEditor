import { inject, injectable } from "inversify";
import { PasteElementsAction } from "./pasteCommand";
import {
    CommitModelAction,
    KeyListener,
    MousePositionTracker,
    SModelElementImpl,
    SModelRootImpl,
    isSelected,
} from "sprotty";
import { Action } from "sprotty-protocol";
import { matchesKeystroke } from "sprotty/lib/utils/keyboard";

/**
 * This class is responsible for listening to ctrl+c and ctrl+v events.
 * On copy the selected elements are copied into an internal array.
 * On paste the {@link PasteElementsAction} is executed to paste the elements.
 * This is done inside a command, so that it can be undone/redone.
 */
@injectable()
export class CopyPasteKeyListener implements KeyListener {
    private copyElements: SModelElementImpl[] = [];

    constructor(@inject(MousePositionTracker) private readonly mousePositionTracker: MousePositionTracker) {}

    keyUp(): Action[] {
        return [];
    }

    keyDown(element: SModelElementImpl, event: KeyboardEvent): Action[] {
        if (matchesKeystroke(event, "KeyC", "ctrl")) {
            return this.copy(element.root);
        } else if (matchesKeystroke(event, "KeyV", "ctrl")) {
            return this.paste();
        }

        return [];
    }

    /**
     * Copy all selected elements into the "clipboard" (the internal element array)
     */
    private copy(root: SModelRootImpl): Action[] {
        this.copyElements = []; // Clear the clipboard

        // Find selected elements
        root.index
            .all()
            .filter((element) => isSelected(element))
            .forEach((e) => this.copyElements.push(e));

        return [];
    }

    /**
     * Pastes elements by creating new elements and copying the properties of the copied elements.
     * This is done inside a command, so that it can be undone/redone.
     */
    private paste(): Action[] {
        const targetPosition = this.mousePositionTracker.lastPositionOnDiagram ?? { x: 0, y: 0 };
        return [PasteElementsAction.create(this.copyElements, targetPosition), CommitModelAction.create()];
    }
}
