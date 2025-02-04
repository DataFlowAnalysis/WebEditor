import { Command, CommandExecutionContext, SModelRootImpl } from "sprotty";
import { Action } from "sprotty-protocol";
import { sendMessage } from "./webSocketHandler";
import { setModelFileName } from "../../index";
import { setFileNameInPageTitle } from "./load";

export interface LoadDFDandDDAction extends Action {
    kind: typeof LoadDFDandDDAction.KIND;
    file: File | undefined;
}
export namespace LoadDFDandDDAction {
    export const KIND = "load-dfd";

    export function create(file?: File): LoadDFDandDDAction {
        return {
            kind: KIND,
            file,
        };
    }
}

export class LoadDFDandDDCommand extends Command {
    static readonly KIND = LoadDFDandDDAction.KIND;

    constructor() {
        super();
    }

    /**
     * Gets the model file from the action or opens a file picker dialog if no file is provided.
     * @returns A promise that resolves to the model file.
     */
    private getModelFiles(): Promise<File[] | undefined> {
        // Open a file picker dialog if no file is provided in the action.
        // The cleaner way to do this would be showOpenFilePicker(),
        // but safari and firefox don't support it at the time of writing this code:
        // https://developer.mozilla.org/en-US/docs/web/api/window/showOpenFilePicker#browser_compatibility
        const input = document.createElement("input");
        input.type = "file";
        input.accept = ".dataflowdiagram, .datadictionary";
        input.multiple = true;

        const fileLoadPromise = new Promise<File[] | undefined>((resolve, reject) => {
            // This event is fired when the user successfully submits the file picker dialog.
            input.onchange = () => {
                if (input.files && input.files.length === 2) {
                    const files = Array.from(input.files);
                    const dataflowFile = files.find((file) => file.name.endsWith(".dataflowdiagram"));
                    const dictionaryFile = files.find((file) => file.name.endsWith(".datadictionary"));

                    if (dataflowFile && dictionaryFile) {
                        resolve([dataflowFile, dictionaryFile]);
                    } else {
                        reject("Please select one .dataflowdiagram file and one .datadictionary file.");
                    }
                } else {
                    reject("You must select exactly two files: one .dataflowdiagram and one .datadictionary.");
                }
            };
        });
        input.click();

        return fileLoadPromise;
    }

    async execute(context: CommandExecutionContext): Promise<SModelRootImpl> {
        try {
            const [dataflowFile, dictionaryFile] = (await this.getModelFiles()) ?? [];

            // Read the content of both files
            const dataflowFileContent = await this.readFileContent(dataflowFile);
            const dictionaryFileContent = await this.readFileContent(dictionaryFile);

            // Send each file's content in separate WebSocket messages
            sendMessage(
                "DFD:" +
                    this.getFileNameWithoutExtension(dataflowFile) +
                    ":" +
                    dataflowFileContent +
                    "\n:DD:\n" +
                    dictionaryFileContent,
            );
            setModelFileName(dataflowFile.name.substring(0, dataflowFile.name.lastIndexOf(".")));
            setFileNameInPageTitle(dataflowFile.name);
            return context.root;
        } catch (error) {
            console.error(error);
            return context.root;
        }
    }

    undo(context: CommandExecutionContext): SModelRootImpl {
        return context.root;
    }

    redo(context: CommandExecutionContext): SModelRootImpl {
        return context.root;
    }

    /**
     * Utility function to read the content of a file as a string.
     * @param file The file to read.
     * @returns A promise that resolves to the file content as a string.
     */
    private readFileContent(file: File): Promise<string> {
        return new Promise((resolve, reject) => {
            const reader = new FileReader();
            reader.onload = () => resolve(reader.result as string);
            reader.onerror = () => reject(reader.error);
            reader.readAsText(file);
        });
    }

    getFileNameWithoutExtension(file: File): string {
        const fileName = file.name;
        return fileName.substring(0, fileName.lastIndexOf(".")) || fileName;
    }
}
