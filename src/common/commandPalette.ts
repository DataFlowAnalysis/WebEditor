import { inject, injectable } from "inversify";
import { ICommandPaletteActionProvider, LabeledAction, SModelRootImpl, CommitModelAction } from "sprotty";
import { Point } from "sprotty-protocol";
import { LoadDiagramAction } from "../features/serialize/load";
import { createDefaultFitToScreenAction } from "../utils";
import { SaveDiagramAction } from "../features/serialize/save";
import { LoadDefaultDiagramAction } from "../features/serialize/loadDefaultDiagram";
import { LayoutModelAction } from "../features/autoLayout/command";

import "@vscode/codicons/dist/codicon.css";
import "sprotty/css/command-palette.css";
import "./commandPalette.css";
import { SaveDFDandDDAction } from "../features/serialize/saveDFDandDD";
import { LoadDFDandDDAction } from "../features/serialize/loadDFDandDD";
import { LoadPalladioAction } from "../features/serialize/loadPalladio";
import { SettingsManager } from "../features/settingsMenu/SettingsManager";

/**
 * Provides possible actions for the command palette.
 */
@injectable()
export class ServerCommandPaletteActionProvider implements ICommandPaletteActionProvider {
    constructor(@inject(SettingsManager) protected readonly settings: SettingsManager) {}

    async getActions(
        root: Readonly<SModelRootImpl>,
        _text: string,
        _lastMousePosition?: Point,
        _index?: number,
    ): Promise<LabeledAction[]> {
        const fitToScreenAction = createDefaultFitToScreenAction(root);
        const commitAction = CommitModelAction.create();

        return [
            new LabeledAction("Load diagram from JSON", [LoadDiagramAction.create(), commitAction], "go-to-file"),
            new LabeledAction("Load DFD and DD", [LoadDFDandDDAction.create(), commitAction], "go-to-file"),
            new LabeledAction("Load Palladio", [LoadPalladioAction.create(), commitAction], "go-to-file"),
            new LabeledAction("Save diagram as JSON", [SaveDiagramAction.create()], "save"),
            new LabeledAction("Save diagram as DFD and DD", [SaveDFDandDDAction.create(), commitAction], "save"),
            new LabeledAction("Load default diagram", [LoadDefaultDiagramAction.create(), commitAction], "clear-all"),
            new LabeledAction("Fit to Screen", [fitToScreenAction], "layout"),
            new LabeledAction(
                "Layout diagram (Method: " + this.settings.layoutMethod + ")",
                [LayoutModelAction.create(), commitAction, fitToScreenAction],
                "layout",
            ),
        ];
    }
}
