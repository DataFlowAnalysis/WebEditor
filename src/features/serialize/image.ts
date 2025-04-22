import { Command, CommandExecutionContext, CommandReturn } from "sprotty";
// typescript does not recognize css files as modules
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import themeCss from "../../theme.css?raw";
// eslint-disable-next-line @typescript-eslint/ban-ts-comment
// @ts-expect-error
import elementCss from "../dfdElements/elementStyles.css?raw";
import { Action } from "sprotty-protocol";
import { getModelFileName } from "../..";

export interface SaveImageAction extends Action {
    kind: typeof SaveImageAction.KIND;
}
export namespace SaveImageAction {
    export const KIND = "save-image";

    export function create(): SaveImageAction {
        return {
            kind: KIND,
        };
    }
}

export class SaveImageCommand extends Command {
    static readonly KIND = SaveImageAction.KIND;
    execute(context: CommandExecutionContext): CommandReturn {
        const root = document.getElementById("sprotty_root");
        if (!root) return context.root;
        const firstChild = root.children[0];
        if (!firstChild) return context.root;
        const innerSvg = firstChild.innerHTML;
        /* The result svg will render (0,0) as the top left corner of the svg.
         * We calculate the minimum translation of all children.
         * We then offset the whole svg by this opposite of this amount.
         */
        const minTranslate = { x: Infinity, y: Infinity };
        for (const child of firstChild.children) {
            const childTranslate = this.getMinTranslate(child as HTMLElement);
            minTranslate.x = Math.min(minTranslate.x, childTranslate.x);
            minTranslate.y = Math.min(minTranslate.y, childTranslate.y);
        }
        const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style type="text/css">${themeCss}\n${elementCss}</style></defs><g transform="translate(${-minTranslate.x}, ${-minTranslate.y})">${innerSvg}</g></svg>`;

        const blob = new Blob([svg], { type: "image/svg+xml" });
        const url = URL.createObjectURL(blob);
        const link = document.createElement("a");
        link.href = url;
        link.download = getModelFileName() + ".svg";
        link.click();

        return context.root;
    }
    undo(context: CommandExecutionContext): CommandReturn {
        return context.root;
    }
    redo(context: CommandExecutionContext): CommandReturn {
        return context.root;
    }

    /**
     * Gets the minimum translation of an element relative to the svg.
     * This is done by recursively getting the translation of all child elements
     * @param e the element to get the translation from
     * @param parentOffset Offset of the containing element
     * @returns Minimum absolute offset of any child element relative to the svg
     */
    private getMinTranslate(
        e: HTMLElement,
        parentOffset: { x: number; y: number } = { x: 0, y: 0 },
    ): { x: number; y: number } {
        const myTranslate = this.getTranslate(e, parentOffset);
        const minTranslate = myTranslate;

        const children = e.children;
        for (const child of children) {
            const childTranslate = this.getMinTranslate(child as HTMLElement, myTranslate);
            minTranslate.x = Math.min(minTranslate.x, childTranslate.x);
            minTranslate.y = Math.min(minTranslate.y, childTranslate.y);
        }
        return minTranslate;
    }

    /**
     * Calculates the absolute translation of an element relative to the svg.
     * If the element has no translation, the offset of the parent is returned.
     * @param e the element to get the translation from
     * @param parentOffset Offset of the containing element
     * @returns Offset of the child relative to the svg
     */
    private getTranslate(
        e: HTMLElement,
        parentOffset: { x: number; y: number } = { x: 0, y: 0 },
    ): { x: number; y: number } {
        const transform = e.getAttribute("transform");
        if (!transform) return parentOffset;
        const translateMatch = transform.match(/translate\(([^)]+)\)/);
        if (!translateMatch) return parentOffset;
        const translate = translateMatch[1].match(/(-?[0-9.]+)(?:, | |,)(-?[0-9.]+)/);
        if (!translate) return parentOffset;
        const x = parseFloat(translate[1]);
        const y = parseFloat(translate[2]);
        const newX = x + parentOffset.x;
        const newY = y + parentOffset.y;
        return { x: newX, y: newY };
    }
}
