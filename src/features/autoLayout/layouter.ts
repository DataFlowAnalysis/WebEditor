import ElkConstructor from "elkjs/lib/elk.bundled";
import { injectable, inject } from "inversify";
import {
    DefaultLayoutConfigurator,
    ElkFactory,
    ElkLayoutEngine,
    IElementFilter,
    ILayoutConfigurator,
} from "sprotty-elk";
import { SChildElementImpl, SShapeElementImpl, isBoundsAware } from "sprotty";
import { SShapeElement, SGraph, SModelIndex } from "sprotty-protocol";
import { ElkShape, LayoutOptions } from "elkjs";
import { LayoutMethod, SettingsManager } from "../../common/settingsMenu";

export class DfdLayoutConfigurator extends DefaultLayoutConfigurator {
    constructor(@inject(SettingsManager) protected readonly settings: SettingsManager) {
        super();
    }

    protected override graphOptions(_sgraph: SGraph, _index: SModelIndex): LayoutOptions {
        // Elk settings. See https://eclipse.dev/elk/reference.html for available options.
        return {
            [LayoutMethod.LINES]: {
                "org.eclipse.elk.algorithm": "org.eclipse.elk.layered",
                "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "30.0",
                "org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers": "20.0",
                "org.eclipse.elk.port.borderOffset": "14.0",
                // Do not do micro layout for nodes, which includes the node dimensions etc.
                // These are all automatically determined by our dfd node views
                "org.eclipse.elk.omitNodeMicroLayout": "true",
                // Balanced graph > straight edges
                "org.eclipse.elk.layered.nodePlacement.favorStraightEdges": "false",
            },
            [LayoutMethod.WRAPPING]: {
                "org.eclipse.elk.algorithm": "org.eclipse.elk.layered",
                "org.eclipse.elk.layered.spacing.nodeNodeBetweenLayers": "10.0", //Save more space between layers (long names might break this!)
                "org.eclipse.elk.layered.spacing.edgeNodeBetweenLayers": "5.0", //Save more space between layers (long names might break this!)
                "org.eclipse.elk.edgeRouting": "ORTHOGONAL", //Edges should be routed orthogonal to each another
                "org.eclipse.elk.layered.layering.strategy": "COFFMAN_GRAHAM",
                "org.eclipse.elk.layered.compaction.postCompaction.strategy": "LEFT_RIGHT_CONSTRAINT_LOCKING", //Compact the resulting graph horizontally
                "org.eclipse.elk.layered.wrapping.strategy": "MULTI_EDGE", //Allow wrapping of multiple edges
                "org.eclipse.elk.layered.wrapping.correctionFactor": "2.0", //Allow the wrapping to occur earlier
                // Do not do micro layout for nodes, which includes the node dimensions etc.
                // These are all automatically determined by our dfd node views
                "org.eclipse.elk.omitNodeMicroLayout": "true",
            },
            [LayoutMethod.CIRCLES]: {
                "org.eclipse.elk.algorithm": "org.eclipse.elk.stress",
                "org.eclipse.elk.force.repulsion": "5.0",
                "org.eclipse.elk.force.iterations": "100", //Reduce iterations for faster formatting, did not notice differences with more iterations
                "org.eclipse.elk.force.repulsivePower": "1", //Edges should repel vertices as well
                "org.eclipse.elk.port.borderOffset": "14.0",
                // Do not do micro layout for nodes, which includes the node dimensions etc.
                // These are all automatically determined by our dfd node views
                "org.eclipse.elk.omitNodeMicroLayout": "true",
                // Balanced graph > straight edges
            },
        }[this.settings.layoutMethod];
    }
}

export const elkFactory = () =>
    new ElkConstructor({
        algorithms: ["layered", "stress"],
    });

/**
 * Layout engine for the DFD editor.
 * This class inherits the default ElkLayoutEngine but overrides the transformShape method.
 * This is necessary because the default ElkLayoutEngine uses the size property of the shapes to determine their sizes.
 * However with dynamically sized shapes, the size property is set to -1, which is undesired.
 * Instead in this case the size should be determined by the bounds property which is dynamically computed.
 *
 * Additionally it centers ports on the node edge instead of putting them right next to the node at the edge.
 */
@injectable()
export class DfdElkLayoutEngine extends ElkLayoutEngine {
    constructor(
        @inject(ElkFactory) elkFactory: ElkFactory,
        @inject(IElementFilter) elementFilter: IElementFilter,
        @inject(ILayoutConfigurator) configurator: ILayoutConfigurator,
    ) {
        super(elkFactory, elementFilter, configurator);
    }

    protected override transformShape(elkShape: ElkShape, sshape: SShapeElementImpl | SShapeElement): void {
        if (sshape.position) {
            elkShape.x = sshape.position.x;
            elkShape.y = sshape.position.y;
        }
        if ("bounds" in sshape) {
            elkShape.width = sshape.bounds.width ?? sshape.size.width;
            elkShape.height = sshape.bounds.height ?? sshape.size.height;
        }
    }

    protected override applyShape(sshape: SShapeElement, elkShape: ElkShape, index: SModelIndex): void {
        // Check if this is a port, if yes we want to center it on the node edge instead of putting it right next to the node at the edge
        if (this.getBasicType(sshape) === "port") {
            // Because we use actually pass SShapeElementImpl instead of SShapeElement to this method
            // we can access the parent property and the bounds of the parent which is the node of this port.
            if (sshape instanceof SChildElementImpl && isBoundsAware(sshape.parent)) {
                const parent = sshape.parent;
                if (elkShape.x && elkShape.width && elkShape.y && elkShape.height) {
                    // Note that the port x and y coordinates are relative to the parent node.

                    // Move inwards from being adjacent to the node edge by half of the port width/height
                    // depending on which edge the port is on.

                    if (elkShape.x <= 0)
                        // Left edge
                        elkShape.x += elkShape.width / 2;
                    if (elkShape.y <= 0)
                        // Top edge
                        elkShape.y += elkShape.height / 2;
                    if (elkShape.x >= parent.bounds.width)
                        // Right edge
                        elkShape.x -= elkShape.width / 2;
                    if (elkShape.y >= parent.bounds.height)
                        // Bottom edge
                        elkShape.y -= elkShape.height / 2;
                }
            }
        }

        super.applyShape(sshape, elkShape, index);
    }
}
