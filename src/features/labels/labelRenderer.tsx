/** @jsx svg */
import { injectable, inject, optional } from "inversify";
import { VNode } from "snabbdom";
import { IActionDispatcher, SNodeImpl, TYPES, svg } from "sprotty";
import { calculateTextSize } from "../../utils";
import { LabelAssignment, LabelTypeRegistry, globalLabelTypeRegistry } from "./labelTypeRegistry";
import { DeleteLabelAssignmentAction } from "./commands";
import { ContainsDfdLabels } from "./elementFeature";
import { SettingsManager } from "../settingsMenu/SettingsManager";

@injectable()
export class DfdNodeLabelRenderer {
    static readonly LABEL_HEIGHT = 10;
    static readonly LABEL_SPACE_BETWEEN = 2;
    static readonly LABEL_SPACING_HEIGHT = DfdNodeLabelRenderer.LABEL_HEIGHT + DfdNodeLabelRenderer.LABEL_SPACE_BETWEEN;
    static readonly LABEL_TEXT_PADDING = 8;

    constructor(
        @inject(TYPES.IActionDispatcher) private readonly actionDispatcher: IActionDispatcher,
        @inject(SettingsManager) private readonly settingsManager: SettingsManager,
        @inject(LabelTypeRegistry) @optional() private readonly labelTypeRegistry?: LabelTypeRegistry,
    ) {}

    /**
     * Gets the label type of the assignment and builds the text to display.
     * From this text the width of the label is calculated using the corresponding font size and padding.
     * @returns a tuple containing the text and the width of the label in pixel
     */
    static computeLabelContent(label: LabelAssignment): [string, number] {
        const labelType = globalLabelTypeRegistry.getLabelType(label.labelTypeId);
        const labelTypeValue = labelType?.values.find((value) => value.id === label.labelTypeValueId);
        if (!labelType || !labelTypeValue) {
            return ["", 0];
        }

        const text = `${labelType.name}: ${labelTypeValue.text}`;
        const width = calculateTextSize(text, "5pt sans-serif").width + DfdNodeLabelRenderer.LABEL_TEXT_PADDING;

        return [text, width];
    }

    renderSingleNodeLabel(node: ContainsDfdLabels & SNodeImpl, label: LabelAssignment, x: number, y: number): VNode {
        const [text, width] = DfdNodeLabelRenderer.computeLabelContent(label);
        const xLeft = x - width / 2;
        const xRight = x + width / 2;
        const height = DfdNodeLabelRenderer.LABEL_HEIGHT;
        const radius = height / 2;

        const deleteLabelHandler = () => {
            const action = DeleteLabelAssignmentAction.create(node, label);
            this.actionDispatcher.dispatch(action);
        };

        return (
            <g class-node-label={true}>
                <rect x={xLeft} y={y} width={width} height={height} rx={radius} ry={radius} />
                <text x={x} y={y + height / 2}>
                    {text}
                </text>
                {
                    // Put a x button to delete the element on the right upper edge
                    node.hoverFeedback ? (
                        <g class-label-delete={true} on={{ click: deleteLabelHandler }}>
                            <circle cx={xRight} cy={y} r={radius * 0.8}></circle>
                            <text x={xRight} y={y}>
                                X
                            </text>
                        </g>
                    ) : undefined
                }
            </g>
        );
    }

    /**
     * Sorts the labels alphabetically by label type name (primary) and label type value text (secondary).
     *
     * @param labels the labels to sort. The operation is performed in-place.
     */
    private sortLabels(labels: LabelAssignment[]): void {
        labels.sort((a, b) => {
            const labelTypeA = this.labelTypeRegistry?.getLabelType(a.labelTypeId);
            const labelTypeB = this.labelTypeRegistry?.getLabelType(b.labelTypeId);
            if (!labelTypeA || !labelTypeB) {
                return 0;
            }

            if (labelTypeA.name < labelTypeB.name) {
                return -1;
            } else if (labelTypeA.name > labelTypeB.name) {
                return 1;
            } else {
                const labelTypeValueA = labelTypeA.values.find((value) => value.id === a.labelTypeValueId);
                const labelTypeValueB = labelTypeB.values.find((value) => value.id === b.labelTypeValueId);
                if (!labelTypeValueA || !labelTypeValueB) {
                    return 0;
                }

                return labelTypeValueA.text.localeCompare(labelTypeValueB.text);
            }
        });
    }

    renderNodeLabels(
        node: ContainsDfdLabels & SNodeImpl,
        baseY: number,
        xOffset = 0,
        labelSpacing = DfdNodeLabelRenderer.LABEL_SPACING_HEIGHT,
    ): VNode | undefined {
        if (this.settingsManager.simplifyNodeNames) {
            return undefined;
        }
        this.sortLabels(node.labels);
        return (
            <g>
                {node.labels.map((label, i) => {
                    const x = node.bounds.width / 2;
                    const y = baseY + i * labelSpacing;
                    return this.renderSingleNodeLabel(node, label, x + xOffset, y);
                })}
            </g>
        );
    }
}
