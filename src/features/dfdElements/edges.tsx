/** @jsx svg */
import { inject, injectable } from "inversify";
import {
    PolylineEdgeViewWithGapsOnIntersections,
    SEdgeImpl,
    // eslint-disable-next-line @typescript-eslint/no-unused-vars
    svg,
    RenderingContext,
    IViewArgs,
    WithEditableLabel,
    isEditableLabel,
    SRoutingHandleView,
} from "sprotty";
import { VNode } from "snabbdom";
import { Point, angleOfPoint, toDegrees, SEdge, SLabel } from "sprotty-protocol";
import { DynamicChildrenEdge } from "./dynamicChildren";
import { SettingsManager } from "../settingsMenu/SettingsManager";

export interface ArrowEdge extends SEdge {
    text?: string;
}

export class ArrowEdgeImpl extends DynamicChildrenEdge implements WithEditableLabel {
    text?: string;

    setChildren(schema: ArrowEdge): void {
        schema.children = [
            {
                type: "label:filled-background",
                text: schema.text ?? "",
                id: schema.id + "-label",
                edgePlacement: {
                    position: 0.5,
                    side: "on",
                    rotate: false,
                },
            } as SLabel,
        ];
    }

    removeChildren(schema: ArrowEdge): void {
        const label = schema.children?.find((element) => element.type.startsWith("label")) as SLabel | undefined;
        schema.text = label?.text ?? "";
        schema.children = [];
    }

    get editableLabel() {
        const label = this.children.find((element) => element.type.startsWith("label"));
        if (label && isEditableLabel(label)) {
            return label;
        }

        return undefined;
    }
}

@injectable()
export class ArrowEdgeView extends PolylineEdgeViewWithGapsOnIntersections {
    constructor(@inject(SettingsManager) protected readonly settings: SettingsManager) {
        super();
    }

    override render(edge: Readonly<SEdgeImpl>, context: RenderingContext, args?: IViewArgs): VNode | undefined {
        // In the default implementation children of the edge are always rendered, because they
        // may be visible when the rest of the edge is not.
        // We only have the edge label as an children which only must be rendered when the rest of the edge is visible.
        // So as an optimization for big diagrams we don't render the label when the rest of the edge is not visible either.
        // Otherwise all these labels would be added to the DOM, making it slow..
        const route = this.edgeRouterRegistry.route(edge, args);
        if (!this.isVisible(edge, route, context)) {
            return undefined;
        }

        return this.superRender(edge, context, args);
    }

    superRender(edge: Readonly<SEdgeImpl>, context: RenderingContext, args?: IViewArgs): VNode | undefined {
        const route = this.edgeRouterRegistry.route(edge, args);
        if (route.length === 0) {
            return this.renderDanglingEdge("Cannot compute route", edge, context);
        }
        if (!this.isVisible(edge, route, context)) {
            if (edge.children.length === 0) {
                return undefined;
            }
            // The children of an edge are not necessarily inside the bounding box of the route,
            // so we need to render a group to ensure the children have a chance to be rendered.
            return <g>{this.settings.hideEdgeLabels ? [] : context.renderChildren(edge, { route })}</g>;
        }

        return (
            <g class-sprotty-edge={true} class-mouseover={edge.hoverFeedback}>
                {this.renderLine(edge, route)}
                {this.renderAdditionals(edge, route, context)}
                {this.renderJunctionPoints(edge, route, context, args)}
                {this.settings.hideEdgeLabels ? [] : context.renderChildren(edge, { route })}
            </g>
        );
    }

    /**
     * Renders an arrow at the end of the edge.
     */
    protected override renderAdditionals(edge: SEdgeImpl, segments: Point[], context: RenderingContext): VNode[] {
        const additionals = super.renderAdditionals(edge, segments, context);
        const p1 = segments[segments.length - 2];
        const p2 = segments[segments.length - 1];
        const arrow = (
            <path
                class-arrow={true}
                d="M 0.5,0 L 10,-4 L 10,4 Z"
                transform={`rotate(${toDegrees(angleOfPoint({ x: p1.x - p2.x, y: p1.y - p2.y }))} ${p2.x} ${
                    p2.y
                }) translate(${p2.x} ${p2.y})`}
                style={{ opacity: edge.opacity.toString() }}
            />
        );
        additionals.push(arrow);
        return additionals;
    }

    /**
     * Renders the edge line.
     * In contrast to the default implementation that we override here,
     * this implementation makes the edge line 10px shorter at the end to make space for the arrow without any overlap.
     */
    protected renderLine(edge: SEdgeImpl, segments: Point[]): VNode {
        const firstPoint = segments[0];
        let path = `M ${firstPoint.x},${firstPoint.y}`;
        for (let i = 1; i < segments.length; i++) {
            const p = segments[i];
            if (i === segments.length - 1) {
                // Make edge line 9.5px shorter to make space for the arrow
                // The arrow is 10px long, but we only shorten by 9.5 px to have overlap at the edge between line and arrow.
                // Otherwise edges would be exactly next to each other which would result in a small gap and flickering if you zoom in enough.
                const prevP = segments[i - 1];
                const dx = p.x - prevP.x;
                const dy = p.y - prevP.y;
                const length = Math.sqrt(dx * dx + dy * dy);
                const ratio = (length - 9.5) / length;
                path += ` L ${prevP.x + dx * ratio},${prevP.y + dy * ratio}`;
            } else {
                // Lines between points in between are not shortened
                path += ` L ${p.x},${p.y}`;
            }
        }
        return (
            <g>
                {/* This is the actual path being rendered */}
                <path d={path} style={{ opacity: edge.opacity.toString() }} />
                {/* This is a transparent path that is rendered on top of the actual path to make it easier to select the edge */}
                <path d={path} class-select-path={true} />
            </g>
        );
    }
}

/**
 * Smaller version of the default edge routing handle.
 */
@injectable()
export class CustomRoutingHandleView extends SRoutingHandleView {
    getRadius(): number {
        return 5;
    }
}
