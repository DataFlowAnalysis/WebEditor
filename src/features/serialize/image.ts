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
        const svg = `<svg xmlns="http://www.w3.org/2000/svg"><defs><style type="text/css">${themeCss}\n${elementCss}</style></defs>${innerSvg}</svg>`;

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
}
