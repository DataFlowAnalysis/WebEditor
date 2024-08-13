import { injectable } from "inversify";
import {
    Connectable,
    isConnectable,
    SChildElementImpl,
    SEdgeImpl,
    SModelElementImpl,
    SParentElementImpl,
} from "sprotty";
import { Action, SEdge, SNode } from "sprotty-protocol";
import { generateRandomSprottyId } from "../../utils";
import { CreationTool } from "./creationTool";

@injectable()
export class EdgeCreationTool extends CreationTool<SEdge, SEdgeImpl> {
    // Pseudo element that is used as a target for the edge while it is being created
    private edgeTargetElement?: SChildElementImpl;

    // We will insert the edge ourselves once we determined the source element.
    // Then we can also insert the edge target element at the mouse position
    // and have the source and target element inserted.
    // Otherwise sprotty would not be able to compute the path of the edge
    // and show dangling elements.
    protected override insertIntoGraphRootAfterCreation = false;

    createElementSchema(): SEdge {
        return {
            id: generateRandomSprottyId(),
            type: this.elementType,
            sourceId: "",
            targetId: "",
        };
    }

    disable(): void {
        if (this.edgeTargetElement) {
            // Pseudo edge target element must always be removed
            // regardless of whether the edge creation was successful or cancelled
            this.edgeTargetElement.parent?.remove(this.edgeTargetElement);
            this.edgeTargetElement = undefined;
        }

        super.disable();
    }

    mouseDown(target: SModelElementImpl, event: MouseEvent): Action[] {
        if (!this.element) {
            // This shouldn't happen
            return [];
        }

        const clickedElement = this.findConnectable(target);
        if (!clickedElement) {
            // Nothing can be connected to this element or its parents, invalid choice
            return [];
        }

        if (this.element.sourceId) {
            // Source already set, so we're setting the target now

            if (clickedElement.canConnect(this.element, "target")) {
                this.element.targetId = clickedElement.id;

                // Finalize creation and disable the tool
                const actions = super.mouseDown(clickedElement, event);
                // mouseDown() calls the parent class disable implementation, but we overwrite it here, so we need to call it manually
                this.disable();
                return actions;
            }
        } else {
            // Source not set yet, so we're setting the source now
            if (clickedElement.canConnect(this.element, "source")) {
                this.element.sourceId = clickedElement.id;

                // Insert the edge to make it visible.
                const root = target.root;
                root.add(this.element);

                // Create a new target element
                // For previewing the edge it must be able to be rendered
                // which means source and target *must* be set even though
                // we don't know the target yet.
                // To work around this we create a dummy target element
                // that is snapped to the current mouse position.
                // It is a SPort because a normal node
                this.edgeTargetElement = this.modelFactory.createElement({
                    id: generateRandomSprottyId(),
                    type: "empty-node",
                    position: this.calculateMousePosition(target, event),
                } as SNode);
                // Add empty node to the graph and as a edge target
                root.add(this.edgeTargetElement);
                this.element.targetId = this.edgeTargetElement.id;

                console.log(root);
            }
        }
        return [];
    }

    /**
     * Recursively searches through the element's parents until a connectable element is found.
     * This is required because the user may click on elements inside a node, which are not connectable.
     * E.g. a the user clicks on a label inside the node but in this case the edge should be connected to the node itself.
     *
     * @param element Element to start searching from
     * @returns The first connectable element found or undefined if none was found
     */
    private findConnectable(
        element: SChildElementImpl | SParentElementImpl | SModelElementImpl,
    ): (Connectable & SModelElementImpl) | undefined {
        if (isConnectable(element)) {
            return element;
        }

        if ("parent" in element && element.parent) {
            return this.findConnectable(element.parent);
        } else {
            return undefined;
        }
    }
}
