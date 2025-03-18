import { SModelRootImpl } from "sprotty";
import { FitToScreenAction, getBasicType, SModelRoot } from "sprotty-protocol";

/**
 * Type identifiers for use with inversify.
 */
export const EDITOR_TYPES = {
    // Enableable and disableable tools that can be used to create new elements.
    CreationTool: Symbol("CreationTool"),
    // All IUIExtension instances that are bound to this symbol will
    // be loaded and enabled at editor startup.
    DefaultUIElement: Symbol("DefaultUIElement"),
};

export const FIT_TO_SCREEN_PADDING = 75;

/**
 * Generates a fit to screen action that fits all nodes on the screen
 * with the default padding.
 */
export function createDefaultFitToScreenAction(root: SModelRootImpl | SModelRoot, animate = true): FitToScreenAction {
    const elementIds = root.children?.filter((child) => getBasicType(child) === "node").map((child) => child.id) ?? [];

    return FitToScreenAction.create(elementIds, {
        padding: FIT_TO_SCREEN_PADDING,
        animate,
    });
}

export function generateRandomSprottyId(): string {
    return Math.random().toString(36).substring(7);
}

interface TextSize {
    width: number;
    height: number;
}
const contextMap = new Map<string, { context: CanvasRenderingContext2D; cache: Map<string, TextSize> }>();

/**
 * Calculates the width and height of the given text in the given font using a 2d canvas.
 * Because this operation requires interacting with the browser including styling etc.
 * this is rather expensive. Therefore the result is cached with the font and text as a cache key
 * The default width for empty text is 20px.
 * Big diagrams with hundreds of text elements (edges, nodes, labels) would not be possible without caching this operation.
 *
 * @param text the text you need the size for
 * @param font the font to use, defaults to "11pt sans-serif"
 * @returns the width and height of the text in pixels. This does not include any padding or margin
 */
export function calculateTextSize(text: string | undefined, font: string = "11pt sans-serif"): TextSize {
    if (!text || text.length === 0) {
        return { width: 20, height: 20 };
    }

    // Get context for the given font or create a new one if it does not exist yet
    let contextObj = contextMap.get(font);
    if (!contextObj) {
        const canvas = document.createElement("canvas");
        const context = canvas.getContext("2d");
        if (!context) {
            throw new Error("Could not create canvas context used to measure text width");
        }

        context.font = font; // This is slow. Thats why we have one instance per font to avoid redoing this
        contextObj = { context, cache: new Map() };
        contextMap.set(font, contextObj);
    }

    const { context, cache } = contextObj;

    // Get text width from cache or compute it
    const cachedMetrics = cache.get(text);
    if (cachedMetrics) {
        return cachedMetrics;
    } else {
        const metrics = context.measureText(text);
        const textSize: TextSize = {
            width: Math.round(metrics.width),
            height: Math.round(metrics.actualBoundingBoxAscent + metrics.actualBoundingBoxDescent),
        };

        cache.set(text, textSize);
        return textSize;
    }
}
