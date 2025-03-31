/** @jsx svg */
// eslint-disable-next-line @typescript-eslint/no-unused-vars
import { IViewArgs, SLabelImpl, SNodeImpl, ShapeView, RenderingContext, svg } from "sprotty";
import { VNode } from "snabbdom";
import { injectable } from "inversify";
import { Point } from "sprotty-protocol";
import { calculateTextSize } from "../../utils";

export interface DfdPositionalLabelArgs extends IViewArgs {
    xPosition: number;
    yPosition: number;
}

@injectable()
export class DfdPositionalLabelView extends ShapeView {
    private getPosition(label: Readonly<SLabelImpl>, args?: DfdPositionalLabelArgs | IViewArgs): Point {
        if (args && "xPosition" in args && "yPosition" in args) {
            return { x: args.xPosition, y: args.yPosition };
        } else {
            const parentSize = (label.parent as SNodeImpl | undefined)?.bounds;
            const width = parentSize?.width ?? 0;
            const height = parentSize?.height ?? 0;
            return { x: width / 2, y: height / 2 };
        }
    }

    render(label: Readonly<SLabelImpl>, _context: RenderingContext, args?: DfdPositionalLabelArgs): VNode | undefined {
        const position = this.getPosition(label, args);

        return (
            <text class-sprotty-label={true} x={position.x} y={position.y}>
                {label.text}
            </text>
        );
    }
}

/**
 * A sprotty label view that renders the label text with a filled background behind it.
 * This is used to make the element behind the label invisible.
 */
@injectable()
export class FilledBackgroundLabelView extends ShapeView {
    static readonly PADDING = 5;

    render(label: Readonly<SLabelImpl>, context: RenderingContext): VNode | undefined {
        if (!this.isVisible(label, context)) {
            return undefined;
        }

        const size = calculateTextSize(label.text);
        const width = size.width + FilledBackgroundLabelView.PADDING;
        const height = size.height + FilledBackgroundLabelView.PADDING;

        return (
            <g class-label-background={true}>
                {label.text ? <rect x={-width / 2} y={-height / 2} width={width} height={height} /> : undefined}
                <text class-sprotty-label={true}>{label.text}</text>
            </g>
        );
    }
}
