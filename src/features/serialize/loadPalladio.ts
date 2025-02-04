import { Command, CommandExecutionContext, SModelRootImpl } from "sprotty";
import { Action } from "sprotty-protocol";
import { setModelFileName } from "../../index";
import { sendMessage } from "./webSocketHandler";

export interface LoadPalladioAction extends Action {
    kind: typeof LoadPalladioAction.KIND;
    file: File | undefined;
}
export namespace LoadPalladioAction {
    export const KIND = "load-pcm";

    export function create(file?: File): LoadPalladioAction {
        return {
            kind: KIND,
            file,
        };
    }
}

export class LoadPalladioCommand extends Command {
    static readonly KIND = LoadPalladioAction.KIND;

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
        input.accept =
            ".pddc, .allocation, .nodecharacteristics, .repository, .resourceenvironment, .system, .usagemodel";
        input.multiple = true;

        const fileLoadPromise = new Promise<File[] | undefined>((resolve, reject) => {
            // This event is fired when the user successfully submits the file picker dialog.
            input.onchange = () => {
                if (input.files && input.files.length === 7) {
                    const files = Array.from(input.files);
                    const requiredFiles = {
                        pddc: files.find((file) => file.name.endsWith(".pddc")),
                        allocation: files.find((file) => file.name.endsWith(".allocation")),
                        nodecharacteristics: files.find((file) => file.name.endsWith(".nodecharacteristics")),
                        repository: files.find((file) => file.name.endsWith(".repository")),
                        resourceenvironment: files.find((file) => file.name.endsWith(".resourceenvironment")),
                        system: files.find((file) => file.name.endsWith(".system")),
                        usagemodel: files.find((file) => file.name.endsWith(".usagemodel")),
                    };

                    // Check if each required file type is present
                    const allFilesPresent = Object.values(requiredFiles).every((file) => file !== undefined);

                    if (allFilesPresent) {
                        resolve(Object.values(requiredFiles) as File[]);
                    } else {
                        reject(
                            "Please select one file of each required type: .pddc, .allocation, .nodecharacteristics, .repository, .resourceenvironment, .system, .usagemodel",
                        );
                    }
                } else {
                    reject("You must select exactly 7 files");
                }
            };
        });
        input.click();

        return fileLoadPromise;
    }

    async execute(context: CommandExecutionContext): Promise<SModelRootImpl> {
        try {
            // Fetch all required files
            const files = (await this.getModelFiles()) ?? []; // Ensure getModelFiles() returns exactly seven files

            // Read the content of each file and structure them
            const fileContents = await Promise.all(
                files.map(async (file) => ({
                    name: file.name, // Full filename with extension
                    content: await this.readFileContent(file),
                })),
            );

            // Construct the message format for WebSocket
            const message = [
                // Add wsId only once at the start
                ...fileContents.map(({ name, content }) => `${name}:${content}`),
            ].join("---FILE---");

            // Send the structured message over WebSocket
            sendMessage(message);

            // Set the model file name and page title based on one of the files (e.g., the first file)
            setModelFileName(files[0].name.substring(0, files[0].name.lastIndexOf(".")));

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
