import ElkConstructor, { ElkExtendedEdge, ElkNode } from "elkjs/lib/elk.bundled";
import { injectable, inject } from "inversify";
import {
    DefaultLayoutConfigurator,
    ElkFactory,
    ElkLayoutEngine,
    IElementFilter,
    ILayoutConfigurator,
    ILayoutPostprocessor,
} from "sprotty-elk";
import { SChildElementImpl, SShapeElementImpl, isBoundsAware } from "sprotty";
import { SShapeElement, SGraph, SModelIndex, SEdge } from "sprotty-protocol";
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
                "org.eclipse.elk.port.borderOffset": "14.0",
            },
            [LayoutMethod.CIRCLES]: {
                "org.eclipse.elk.algorithm": "org.eclipse.elk.stress",
                "org.eclipse.elk.force.repulsion": "5.0",
                "org.eclipse.elk.force.iterations": "100", //Reduce iterations for faster formatting, did not notice differences with more iterations
                "org.eclipse.elk.force.repulsivePower": "1", //Edges should repel vertices as well
                // Do not do micro layout for nodes, which includes the node dimensions etc.
                // These are all automatically determined by our dfd node views
                "org.eclipse.elk.omitNodeMicroLayout": "true",
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
        @inject(SettingsManager) protected readonly settings: SettingsManager,
        @inject(ILayoutPostprocessor) protected readonly postprocessor: ILayoutPostprocessor,
    ) {
        super(elkFactory, elementFilter, configurator, undefined, postprocessor);
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

    protected override transformEdge(sedge: SEdge, index: SModelIndex): ElkExtendedEdge {
        // remove all middle points of edge and only keep source and target
        const elkEdge = super.transformEdge(sedge, index);
        elkEdge.sections = [];
        return elkEdge;
    }

    protected override applyShape(sshape: SShapeElement, elkShape: ElkShape, index: SModelIndex): void {
        // Check if this is a port, if yes we want to center it on the node edge instead of putting it right next to the node at the edge
        if (this.getBasicType(sshape) === "port") {
            // Because we use actually pass SShapeElementImpl instead of SShapeElement to this method
            // we can access the parent property and the bounds of the parent which is the node of this port.
            if (sshape instanceof SChildElementImpl && isBoundsAware(sshape.parent)) {
                const parent = sshape.parent;
                if (
                    elkShape.x !== undefined &&
                    elkShape.width !== undefined &&
                    elkShape.y !== undefined &&
                    elkShape.height !== undefined
                ) {
                    // Note that the port x and y coordinates are relative to the parent node.

                    // Move inwards from being adjacent to the node edge by half of the port width/height
                    // depending on which edge the port is on.

                    // depending on the mode the ports may be placed differently
                    if (this.settings.layoutMethod === LayoutMethod.CIRCLES) {
                        if (elkShape.x <= 0)
                            // Left edge
                            elkShape.x -= elkShape.width / 2;
                        if (elkShape.y <= 0)
                            // Top edge
                            elkShape.y -= elkShape.height / 2;
                        if (elkShape.x >= parent.bounds.width)
                            // Right edge
                            elkShape.x -= elkShape.width / 2;
                        if (elkShape.y >= parent.bounds.height)
                            // Bottom edge
                            elkShape.y -= elkShape.height / 2;
                    } else {
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
        }

        super.applyShape(sshape, elkShape, index);
    }

    protected applyEdge(sedge: SEdge, elkEdge: ElkExtendedEdge, index: SModelIndex): void {
        if (this.settings.layoutMethod === LayoutMethod.CIRCLES) {
            // In the circles layout method, we want to make sure that the edge is not straight
            // This is because the circles layout method does not support straight edges
            elkEdge.sections = [];
        }
        super.applyEdge(sedge, elkEdge, index);
    }
}

export class CircleLayoutPostProcessor implements ILayoutPostprocessor {
    private portToNodes: Map<string, string> = new Map();
    private connectedPorts: Map<string, string[]> = new Map();
    private nodeSquares: Map<string, Square> = new Map();

    constructor(@inject(SettingsManager) protected readonly settings: SettingsManager) {}

    postprocess(elkGraph: ElkNode): void {
        if (this.settings.layoutMethod !== LayoutMethod.CIRCLES) {
            return;
        }
        this.connectedPorts = new Map<string, string[]>();
        if (!elkGraph.edges || !elkGraph.children) {
            return;
        }
        for (const edge of elkGraph.edges) {
            for (const source of edge.sources) {
                if (!this.connectedPorts.has(source)) {
                    this.connectedPorts.set(source, []);
                }
                for (const target of edge.targets) {
                    if (!this.connectedPorts.has(target)) {
                        this.connectedPorts.set(target, []);
                    }
                    this.connectedPorts.get(source)?.push(target);
                    this.connectedPorts.get(target)?.push(source);
                }
            }
        }

        this.portToNodes = new Map<string, string>();
        this.nodeSquares = new Map<string, Square>();
        for (const node of elkGraph.children) {
            if (node.ports) {
                for (const port of node.ports) {
                    this.portToNodes.set(port.id, node.id);
                }
                this.nodeSquares.set(node.id, this.getNodeSquare(node));
            }
        }

        for (const [port, connected] of this.connectedPorts) {
            if (connected.length === 0) {
                continue;
            }
            const intersections = connected.map((connection) => {
                const line = this.getLine(port, connection);
                const node = this.portToNodes.get(port);
                if (!node) {
                    return { x: 0, y: 0 };
                }
                const square = this.nodeSquares.get(node);
                if (!square) {
                    return { x: 0, y: 0 };
                }
                const intersection = this.getIntersection(square, line);
                return intersection;
            });
            const average = {
                x: intersections.reduce((sum, intersection) => sum + intersection.x, 0) / intersections.length,
                y: intersections.reduce((sum, intersection) => sum + intersection.y, 0) / intersections.length,
            };

            const node = this.portToNodes.get(port);
            if (!node) {
                continue;
            }
            const square = this.nodeSquares.get(node);
            if (!square) {
                continue;
            }
            const closestPointOnEdge = {
                x: average.x,
                y: average.y,
            };

            const topEdge = { x1: square.x, y1: square.y, x2: square.x + square.width, y2: square.y };
            const bottomEdge = {
                x1: square.x,
                y1: square.y + square.height,
                x2: square.x + square.width,
                y2: square.y + square.height,
            };
            const leftEdge = { x1: square.x, y1: square.y, x2: square.x, y2: square.y + square.height };
            const rightEdge = {
                x1: square.x + square.width,
                y1: square.y,
                x2: square.x + square.width,
                y2: square.y + square.height,
            };
            const distances = [
                { distance: Math.abs(average.y - square.y), dimension: "y", edge: topEdge },
                { distance: Math.abs(average.y - (square.y + square.height)), dimension: "y", edge: bottomEdge },
                { distance: Math.abs(average.x - square.x), dimension: "x", edge: leftEdge },
                { distance: Math.abs(average.x - (square.x + square.width)), dimension: "x", edge: rightEdge },
            ];
            distances.sort((a, b) => a.distance - b.distance);
            const closestEdge = distances[0].edge;
            if (distances[0].dimension === "y") {
                closestPointOnEdge.x = clamp(average.x, closestEdge.x1, closestEdge.x2);
                closestPointOnEdge.y = closestEdge.y1;
            } else {
                closestPointOnEdge.x = closestEdge.x1;
                closestPointOnEdge.y = clamp(average.y, closestEdge.y1, closestEdge.y2);
            }

            const nodeElk = elkGraph.children.find((child) => child.id === node);
            if (!nodeElk) {
                continue;
            }
            const portElk = nodeElk.ports?.find((p) => p.id === port);
            if (!portElk) {
                continue;
            }
            portElk.x = closestPointOnEdge.x - (nodeElk.x ?? 0);
            portElk.y = closestPointOnEdge.y - (nodeElk.y ?? 0);
        }
    }

    getNodeSquare(node: ElkNode): Square {
        return {
            x: node.x ?? 0,
            y: node.y ?? 0,
            width: node.width ?? 0,
            height: node.height ?? 0,
        };
    }

    getCenter(square: Square): { x: number; y: number } {
        return {
            x: square.x + square.width / 2,
            y: square.y + square.height / 2,
        };
    }

    getLine(port1: string, port2: string): Line {
        const node1 = this.portToNodes.get(port1);
        const node2 = this.portToNodes.get(port2);
        if (!node1 || !node2) {
            return {
                x1: 0,
                y1: 0,
                x2: 0,
                y2: 0,
            };
        }
        const square1 = this.nodeSquares.get(node1)!;
        const square2 = this.nodeSquares.get(node2)!;
        const center1 = this.getCenter(square1);
        const center2 = this.getCenter(square2);

        return {
            x1: center1.x,
            y1: center1.y,
            x2: center2.x,
            y2: center2.y,
        };
    }

    getIntersection(square: Square, line: Line): { x: number; y: number } {
        const topLeft = { x: square.x, y: square.y };
        const topRight = { x: square.x + square.width, y: square.y };
        const bottomLeft = { x: square.x, y: square.y + square.height };
        const bottomRight = { x: square.x + square.width, y: square.y + square.height };

        const intersections = [
            this.getLineIntersection(line, { x1: topLeft.x, y1: topLeft.y, x2: topRight.x, y2: topRight.y }),
            this.getLineIntersection(line, { x1: topRight.x, y1: topRight.y, x2: bottomRight.x, y2: bottomRight.y }),
            this.getLineIntersection(line, {
                x1: bottomRight.x,
                y1: bottomRight.y,
                x2: bottomLeft.x,
                y2: bottomLeft.y,
            }),
            this.getLineIntersection(line, { x1: bottomLeft.x, y1: bottomLeft.y, x2: topLeft.x, y2: topLeft.y }),
        ];

        const inLineBounds = intersections.filter((intersection) => {
            return (
                intersection.x >= Math.min(line.x1, line.x2) &&
                intersection.x <= Math.max(line.x1, line.x2) &&
                intersection.y >= Math.min(line.y1, line.y2) &&
                intersection.y <= Math.max(line.y1, line.y2)
            );
        });
        return inLineBounds[0] ?? { x: 0, y: 0 };
    }

    private getLineIntersection(line1: Line, line2: Line): { x: number; y: number } {
        const x1 = line1.x1;
        const y1 = line1.y1;
        const x2 = line1.x2;
        const y2 = line1.y2;
        const x3 = line2.x1;
        const y3 = line2.y1;
        const x4 = line2.x2;
        const y4 = line2.y2;

        const denominator = (x1 - x2) * (y3 - y4) - (y1 - y2) * (x3 - x4);
        if (denominator === 0) {
            return { x: 0, y: 0 };
        }

        const x = ((x1 * y2 - y1 * x2) * (x3 - x4) - (x1 - x2) * (x3 * y4 - y3 * x4)) / denominator;
        const y = ((x1 * y2 - y1 * x2) * (y3 - y4) - (y1 - y2) * (x3 * y4 - y3 * x4)) / denominator;

        return { x, y };
    }
}

interface Square {
    x: number;
    y: number;
    width: number;
    height: number;
}

interface Line {
    x1: number;
    y1: number;
    x2: number;
    y2: number;
}

function clamp(value: number, l1: number, l2: number): number {
    const min = Math.min(l1, l2);
    const max = Math.max(l1, l2);
    return Math.max(min, Math.min(max, value));
}
