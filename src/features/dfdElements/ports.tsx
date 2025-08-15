/** @jsx svg */
import {
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    svg,
    ShapeView,
    SPortImpl,
    RenderingContext,
    moveFeature,
    deletableFeature,
    withEditLabelFeature,
    isEditableLabel,
    SRoutableElementImpl,
} from "sprotty";
import { Bounds, SPort } from "sprotty-protocol";
import { injectable } from "inversify";
import { VNode, VNodeStyle } from "snabbdom";
import { ArrowEdgeImpl } from "./edges";
import { AutoCompleteTree } from "../constraintMenu/AutoCompletion";
import { TreeBuilder } from "./AssignmentLanguage";
import { labelTypeRegistry } from "../..";

const defaultPortFeatures = [...SPortImpl.DEFAULT_FEATURES, moveFeature, deletableFeature];
const portSize = 7;

export type DfdInputPort = SPort;

@injectable()
export class DfdInputPortImpl extends SPortImpl {
    static readonly DEFAULT_FEATURES = defaultPortFeatures;

    override get bounds(): Bounds {
        return {
            x: this.position.x,
            y: this.position.y,
            width: portSize,
            height: portSize,
        };
    }

    /**
     * Builds the name of the input port from the names of the incoming dfd edges.
     * @returns either the concatenated names of the incoming edges or undefined if there are no named incoming edges.
     */
    getName(): string | undefined {
        const edgeNames: string[] = [];

        this.incomingEdges.forEach((edge) => {
            if (edge instanceof ArrowEdgeImpl) {
                const name = edge.editableLabel?.text;
                if (name) {
                    edgeNames.push(name);
                }
            } else {
                return undefined;
            }
        });

        if (edgeNames.length === 0) {
            return undefined;
        } else {
            return edgeNames.sort().join("|");
        }
    }

    canConnect(_routable: SRoutableElementImpl, role: "source" | "target"): boolean {
        // Only allow edges into this port
        return role === "target";
    }
}

export class DfdInputPortView extends ShapeView {
    render(node: Readonly<SPortImpl>, context: RenderingContext): VNode | undefined {
        if (!this.isVisible(node, context)) {
            return undefined;
        }

        const { width, height } = node.bounds;

        return (
            <g class-sprotty-port={true} class-selected={node.selected} style={{ opacity: node.opacity.toString() }}>
                <rect x="0" y="0" width={width} height={height} />
                <text x={width / 2} y={height / 2} class-port-text={true}>
                    I
                </text>
                {context.renderChildren(node)}
            </g>
        );
    }
}

export interface DfdOutputPort extends SPort {
    behavior: string;
}

@injectable()
export class DfdOutputPortImpl extends SPortImpl {
    static readonly DEFAULT_FEATURES = [...defaultPortFeatures, withEditLabelFeature];

    behavior: string = "";
    private tree: AutoCompleteTree;

    constructor() {
        super();
        this.tree = new AutoCompleteTree(TreeBuilder.buildTree(labelTypeRegistry, this));
    }

    override get bounds(): Bounds {
        return {
            x: this.position.x,
            y: this.position.y,
            width: portSize,
            height: portSize,
        };
    }

    get editableLabel() {
        const label = this.children.find((element) => element.type === "label:invisible");
        if (label && isEditableLabel(label)) {
            return label;
        }

        return undefined;
    }

    canConnect(_routable: SRoutableElementImpl, role: "source" | "target"): boolean {
        // Only allow edges from this port outwards
        return role === "source";
    }

    /**
     * Generates the per-node inline style object for the view.
     */
    geViewStyleObject(): VNodeStyle {
        const style: VNodeStyle = {
            opacity: this.opacity.toString(),
        };
        if (!labelTypeRegistry) return style;
        const valid = this.tree.verify(this.behavior.split("\n")).length == 0;

        if (!valid) {
            style["--port-border"] = "#ff0000";
            style["--port-color"] = "#ff6961";
        }

        return style;
    }
}

@injectable()
export class DfdOutputPortView extends ShapeView {
    render(node: Readonly<DfdOutputPortImpl>, context: RenderingContext): VNode | undefined {
        if (!this.isVisible(node, context)) {
            return undefined;
        }

        const { width, height } = node.bounds;

        return (
            <g class-sprotty-port={true} class-selected={node.selected} style={node.geViewStyleObject()}>
                <rect x="0" y="0" width={width} height={height} />
                <text x={width / 2} y={height / 2} class-port-text={true}>
                    O
                </text>
                {context.renderChildren(node)}
            </g>
        );
    }
}
