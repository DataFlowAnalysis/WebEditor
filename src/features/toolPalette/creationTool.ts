import {
    ActionDispatcher,
    CommandExecutionContext,
    CommandReturn,
    CommandStack,
    CommitModelAction,
    ICommand,
    ILogger,
    IModelFactory,
    ISnapper,
    KeyListener,
    MouseListener,
    MousePositionTracker,
    MouseTool,
    SChildElementImpl,
    SEdgeImpl,
    SGraphImpl,
    SModelElementImpl,
    SNodeImpl,
    SParentElementImpl,
    SPortImpl,
    TYPES,
} from "sprotty";
import { inject, injectable, multiInject } from "inversify";
import { DynamicChildrenProcessor } from "../dfdElements/dynamicChildren";
import { Action, Point, SEdge, SNode, SPort } from "sprotty-protocol";
import { EDITOR_TYPES } from "../../utils";

type Positionable = { position?: Point };
type Schema = (SNode | SEdge | SPort) & Positionable;
type Impl = SNodeImpl | SEdgeImpl | SPortImpl;
export type AnyCreationTool = CreationTool<Schema, Impl>;

/**
 * Common interface between all tools used by the tool palette to create new elements.
 * These tools are meant to be enabled, allow the user to perform some action like creating a new node or edge,
 * and then they should disable themselves when the action is done.
 * Alternatively they can be disabled from the UI or other code to cancel the tool usage.
 */
@injectable()
export abstract class CreationTool<S extends Schema, I extends Impl> extends MouseListener {
    protected element?: I;
    protected readonly previewOpacity = 0.5;
    protected insertIntoGraphRootAfterCreation = true;
    protected elementType = "";

    constructor(
        @inject(MouseTool) protected mouseTool: MouseTool,
        @inject(MousePositionTracker) protected mousePositionTracker: MousePositionTracker,
        @inject(DynamicChildrenProcessor) protected dynamicChildrenProcessor: DynamicChildrenProcessor,
        @inject(TYPES.IModelFactory) protected modelFactory: IModelFactory,
        @inject(TYPES.IActionDispatcher) protected actionDispatcher: ActionDispatcher,
        @inject(TYPES.ICommandStack) protected commandStack: CommandStack,
        @inject(TYPES.ISnapper) protected snapper: ISnapper,
        @inject(TYPES.ILogger) protected logger: ILogger,
    ) {
        super();
    }

    abstract createElementSchema(): S;

    protected async createElement(): Promise<I> {
        const schema = this.createElementSchema();

        // Create the element with the preview opacity to indicated it is not placed yet
        // Only set opacity if it is not already set in the schema
        schema.opacity ??= this.previewOpacity;

        // Add any dynamically declared children to the node schema.
        this.dynamicChildrenProcessor.processGraphChildren(schema, "set");

        const element = this.modelFactory.createElement(schema) as I;
        if (this.insertIntoGraphRootAfterCreation) {
            const root = await this.commandStack.executeAll([]);
            root.add(element);
        }

        return element;
    }

    enable(elementType: string): void {
        this.elementType = elementType;
        this.mouseTool.register(this);
        this.createElement()
            .then((element) => {
                this.element = element;
                this.logger.log(this, "Created element", element);

                // Show element at current mouse position
                if (this.mousePositionTracker.lastPositionOnDiagram) {
                    this.updateElementPosition(this.mousePositionTracker.lastPositionOnDiagram);
                }
            })
            .catch((error) => {
                this.logger.error(this, "Failed to create element", error);
            });
    }

    disable(): void {
        this.mouseTool.deregister(this);

        if (this.element) {
            // Element is not placed yet but we're disabling the tool.
            // This means the creation was cancelled and the element should be deleted.

            // Get root before removing the element, needed for re-render
            let root: SGraphImpl | undefined;
            try {
                root = this.element.root as SGraphImpl;
            } catch (error) {
                // element has no assigned root
                void error;
            }

            // Remove element from graph
            this.element.parent?.remove(this.element);
            this.element = undefined;

            // Re-render the graph to remove the element from the preview.
            // Root may be unavailable e.g. when the element hasn't been inserted into
            // the diagram yet. Skipping the render in those cases is fine as the element
            // wasn't rendered in such case anyway.
            if (root) {
                this.commandStack.update(root);
            }

            this.logger.info(this, "Cancelled element creation");
        }
    }

    protected finishPlacingElement(): void {
        if (this.element) {
            const elementParent = this.element.parent;
            // Remove the element as it was only added as a temporary preview element
            elementParent.remove(this.element);

            // Make node fully visible
            this.element.opacity = 1;

            // Set via a command for redo/undo support.
            // This inserts the created element properly into the model in contrast to the
            // temporary add done previously.
            this.actionDispatcher.dispatch(AddElementToGraphAction.create(this.element, elementParent));

            this.logger.log(this, "Finalized element creation of element", this.element);
            this.element = undefined; // Unset to prevent further actions
        }
        this.disable();
    }

    private updateElementPosition(mousePosition: Point): void {
        if (!this.element) {
            return;
        }

        const newPosition = { ...mousePosition };

        if (this.element instanceof SEdgeImpl) {
            // Snap the edge target to the mouse position, if there is a target element.
            if (this.element.targetId && this.element.target) {
                if (!Point.equals(this.element.target.position, newPosition)) {
                    this.element.target.position = newPosition;
                    // Trigger re-rendering of the edge
                    this.commandStack.update(this.element.root);
                }
            }
        } else {
            const previousPosition = this.element.position;

            // Adapt the mouse position depending on element type
            if (this.element instanceof SNodeImpl) {
                // The node should be created to have its center at the mouse position.
                // Because of this, we need to adjust the position by half the size of the element.
                const { width, height } = this.element.bounds;
                newPosition.x -= width / 2;
                newPosition.y -= height / 2;
            } else if (this.element instanceof SPortImpl) {
                // Port positions must be relative to the target node.
                // So we need to convert the absolute graph position of the mouse
                // to a position relative to the target node.
                const parent = this.element.parent;
                if (parent instanceof SNodeImpl) {
                    newPosition.x -= parent.position.x;
                    newPosition.y -= parent.position.y;
                }
            }

            // Snap the element to the corresponding grid
            const newPositionSnapped = this.snapper.snap(newPosition, this.element);

            // Only update if the position after snapping has changed (aka the effective position).
            if (!Point.equals(previousPosition, newPositionSnapped)) {
                this.element.position = newPositionSnapped;
                // Trigger re-rendering of the node/port
                this.commandStack.update(this.element.root);
            }
        }
    }

    mouseMove(target: SModelElementImpl, event: MouseEvent): (Action | Promise<Action>)[] {
        const mousePosition = this.calculateMousePosition(target, event);
        this.updateElementPosition(mousePosition);
        return [];
    }

    mouseDown(_target: SModelElementImpl, event: MouseEvent): Action[] {
        event.preventDefault(); // prevents additional click onto the newly created element

        this.finishPlacingElement();

        return [
            CommitModelAction.create(), // Save to element ModelSource
        ];
    }

    /**
     * Calculates the mouse position in graph coordinates.
     */
    protected calculateMousePosition(target: SModelElementImpl, event: MouseEvent): Point {
        const root = target.root as SGraphImpl;

        const calcPos = (axis: "x" | "y") => {
            // Position of the top left viewport corner in the whole graph
            const rootPosition = root.scroll[axis];
            // Offset of the mouse position from the top left viewport corner in screen pixels
            const screenOffset = axis === "x" ? event.offsetX : event.offsetY;
            // Offset of the mouse position from the top left viewport corner in graph coordinates
            const screenOffsetNormalized = screenOffset / root.zoom;

            // Add position
            return rootPosition + screenOffsetNormalized;
        };
        return {
            x: calcPos("x"),
            y: calcPos("y"),
        };
    }
}

/**
 * Adds the given element to the graph at the root level.
 */
export interface AddElementToGraphAction extends Action {
    kind: typeof AddElementToGraphAction.TYPE;
    element: SChildElementImpl;
    parent: SParentElementImpl;
}
export namespace AddElementToGraphAction {
    export const TYPE = "addElementToGraph";
    export function create(element: SChildElementImpl, parent: SParentElementImpl): AddElementToGraphAction {
        return {
            kind: TYPE,
            element,
            parent,
        };
    }
}

@injectable()
export class AddElementToGraphCommand implements ICommand {
    public static readonly KIND = AddElementToGraphAction.TYPE;

    constructor(@inject(TYPES.Action) private action: AddElementToGraphAction) {}

    execute(context: CommandExecutionContext): CommandReturn {
        this.action.parent.add(this.action.element);
        return context.root;
    }

    undo(context: CommandExecutionContext): CommandReturn {
        this.action.element.parent.remove(this.action.element);
        return context.root;
    }

    redo(context: CommandExecutionContext): CommandReturn {
        return this.execute(context);
    }
}

/**
 * Util key listener that disables all registered creation tools when the escape key is pressed.
 */
@injectable()
export class CreationToolDisableKeyListener extends KeyListener {
    @multiInject(EDITOR_TYPES.CreationTool) protected tools: AnyCreationTool[] = [];

    override keyDown(_element: SModelElementImpl, event: KeyboardEvent): Action[] {
        if (event.key === "Escape") {
            this.disableAllTools();
        }

        return [];
    }

    private disableAllTools(): void {
        this.tools.forEach((tool) => tool.disable());
    }
}
