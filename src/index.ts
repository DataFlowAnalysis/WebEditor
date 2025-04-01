import "reflect-metadata";

import { Container } from "inversify";
import {
    AbstractUIExtension,
    ActionDispatcher,
    CommitModelAction,
    LocalModelSource,
    SetUIExtensionVisibilityAction,
    TYPES,
    labelEditUiModule,
    loadDefaultModules,
} from "sprotty";
import { elkLayoutModule } from "sprotty-elk";
import { autoLayoutModule } from "./features/autoLayout/di.config";
import { commonModule } from "./common/di.config";
import { noScrollLabelEditUiModule } from "./common/labelEditNoScroll";
import { dfdLabelModule } from "./features/labels/di.config";
import { toolPaletteModule } from "./features/toolPalette/di.config";
import { serializeModule } from "./features/serialize/di.config";
import { LoadDefaultDiagramAction } from "./features/serialize/loadDefaultDiagram";
import { dfdElementsModule } from "./features/dfdElements/di.config";
import { copyPasteModule } from "./features/copyPaste/di.config";
import { EDITOR_TYPES } from "./utils";
import { editorModeModule } from "./features/editorMode/di.config";
import { constraintMenuModule } from "./features/constraintMenu/di.config";

import "sprotty/css/sprotty.css";
import "sprotty/css/edit-label.css";
import "./theme.css";
import "./page.css";
import { settingsModule } from "./features/settingsMenu/di.config";
import { LoadDiagramAction } from "./features/serialize/load";
import { commandPaletteModule } from "./features/commandPalette/di.config";

const container = new Container();

// Load default sprotty provided modules
loadDefaultModules(container, {
    exclude: [
        labelEditUiModule, // We provide our own label edit ui inheriting from the default one (noScrollLabelEditUiModule)
    ],
});

// sprotty-elk layouting extension
container.load(elkLayoutModule);

// Custom modules that we provide ourselves
container.load(
    commonModule,
    settingsModule,
    noScrollLabelEditUiModule,
    autoLayoutModule,
    dfdElementsModule,
    serializeModule,
    dfdLabelModule,
    editorModeModule,
    toolPaletteModule,
    copyPasteModule,
    constraintMenuModule,
    commandPaletteModule,
);

const dispatcher = container.get<ActionDispatcher>(TYPES.IActionDispatcher);
const defaultUIElements = container.getAll<AbstractUIExtension>(EDITOR_TYPES.DefaultUIElement);
const modelSource = container.get<LocalModelSource>(TYPES.ModelSource);

let modelFileName = "diagram";

export function setModelFileName(name: string): void {
    modelFileName = name;
}

export function getModelFileName(): string {
    return modelFileName;
}

export function setModelSource(file: File): void {
    modelSource
        .setModel({
            type: "graph",
            id: "root",
            children: [],
        })
        .then(() =>
            dispatcher.dispatchAll([
                // Show the default uis after startup
                ...defaultUIElements.map((uiElement) => {
                    return SetUIExtensionVisibilityAction.create({
                        extensionId: uiElement.id(),
                        visible: true,
                    });
                }),
                // Then load the default diagram and commit the temporary model to the model source
                LoadDiagramAction.create(file),
                CommitModelAction.create(),
            ]),
        )
        .then(() => {
            // Focus the sprotty svg container to enable keyboard shortcuts
            // because those only work if the svg container is focused.
            // Allows to e.g. use the file open shortcut without having to click
            // on the sprotty svg container first.
            const sprottySvgContainer = document.getElementById("sprotty_root");
            sprottySvgContainer?.focus();
        })
        .catch((error) => {
            console.error("Failed to show default UIs and load default diagram", error);
        });
}

// Set empty model as starting point.
// In contrast to the default diagram later this is not undoable which would bring the editor
// into an invalid state where no root element is present.
modelSource
    .setModel({
        type: "graph",
        id: "root",
        children: [],
    })
    .then(() =>
        dispatcher.dispatchAll([
            // Show the default uis after startup
            ...defaultUIElements.map((uiElement) => {
                return SetUIExtensionVisibilityAction.create({
                    extensionId: uiElement.id(),
                    visible: true,
                });
            }),
            // Then load the default diagram and commit the temporary model to the model source
            LoadDefaultDiagramAction.create(),
            CommitModelAction.create(),
        ]),
    )
    .then(() => {
        // Focus the sprotty svg container to enable keyboard shortcuts
        // because those only work if the svg container is focused.
        // Allows to e.g. use the file open shortcut without having to click
        // on the sprotty svg container first.
        const sprottySvgContainer = document.getElementById("sprotty_root");
        sprottySvgContainer?.focus();
    })
    .catch((error) => {
        console.error("Failed to show default UIs and load default diagram", error);
    });
