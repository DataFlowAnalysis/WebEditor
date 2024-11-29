import { inject, injectable, optional } from "inversify";
import { LabelTypeRegistry } from "../labels/labelTypeRegistry";
import { DfdNodeImpl } from "./nodes";
import { DfdOutputPortImpl } from "./ports";

/**
 * Validation error for a single line of the behavior text of a dfd output port.
 */
interface PortBehaviorValidationError {
    message: string;
    // line and column numbers start at 0!
    line: number;
    colStart?: number;
    colEnd?: number;
}

/**
 * Validates the behavior text of a dfd output port (DfdOutputPortImpl).
 * Used inside the OutputPortEditUI.
 */
@injectable()
export class PortBehaviorValidator {
    // RegEx validating names of input pins
    private static readonly INPUT_LABEL_REGEX = /[A-Za-z0-9_~][A-Za-z0-9_~\|]+/;

    // RegEx validating names of output labels
    private static readonly OUTPUT_LABEL_REGEX = /[A-Za-z0-9_]+\.[A-Za-z0-9_]+/;

    // Regex that validates a term
    // Has the label type and label value that should be set as capturing groups.
    private static readonly TERM_REGEX =
        /(?:\s*|!|TRUE|FALSE|\|\||&&|\(|\)|(?:[A-Za-z0-9_]+\.[A-Za-z0-9_]+(?![A-Za-z0-9_]*\.[A-Za-z0-9_]*)))+/g;

    // Regex that validates assignments
    // Matches "assign out_labels if term from in_pins" where out_labels is a comma separated list of output labels, in_pins is a comma separated list of input pins and the from part is optional.
    private static readonly ASSIGNMENT_REGEX = new RegExp(
        "^assign (" +
            PortBehaviorValidator.BUILD_COMMA_SEPARATED_LIST_REGEX(PortBehaviorValidator.OUTPUT_LABEL_REGEX).source +
            ") if (" +
            PortBehaviorValidator.TERM_REGEX.source +
            ")(?: from (" +
            PortBehaviorValidator.BUILD_COMMA_SEPARATED_LIST_REGEX(PortBehaviorValidator.INPUT_LABEL_REGEX).source +
            "))?$",
    );

    // Regex that validates forwarding
    // Matches "forward input_pins" where input_pins is a comma separated list of input pins.
    private static readonly FORWARDING_REGEX = new RegExp(
        "^forward " +
            PortBehaviorValidator.BUILD_COMMA_SEPARATED_LIST_REGEX(PortBehaviorValidator.INPUT_LABEL_REGEX).source +
            "$",
    );

    private static readonly SET_AND_UNSET_REGEX = new RegExp(
        "^(un)?set " +
            PortBehaviorValidator.BUILD_COMMA_SEPARATED_LIST_REGEX(PortBehaviorValidator.OUTPUT_LABEL_REGEX).source +
            "$",
    );

    // Regex matching alphanumeric characters.
    public static readonly REGEX_ALPHANUMERIC = /[A-Za-z0-9_\|]+/;

    constructor(@inject(LabelTypeRegistry) @optional() private readonly labelTypeRegistry?: LabelTypeRegistry) {}

    /**
     * validates the whole behavior text of a port.
     * @param behaviorText the behavior text to validate
     * @param port the port that the behavior text should be tested against (relevant for available inputs)
     * @returns errors, if everything is fine the array is empty
     */
    validate(behaviorText: string, port: DfdOutputPortImpl): PortBehaviorValidationError[] {
        const lines = behaviorText.split("\n");
        const errors: PortBehaviorValidationError[] = [];
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i];
            const lineErrors = this.validateLine(line, i, port);
            if (lineErrors) {
                const errorsCols = lineErrors.map((error) => {
                    // Set cols to start/end of line if not set.
                    error.colEnd ??= line.length;
                    error.colStart ??= 0;

                    return error;
                });

                errors.push(...errorsCols);
            }
        }

        return errors;
    }

    /**
     * Validates a single line and returns an error message if the line is invalid.
     * Otherwise returns undefined.
     */
    private validateLine(
        line: string,
        lineNumber: number,
        port: DfdOutputPortImpl,
    ): PortBehaviorValidationError[] | undefined {
        if (line === "" || line.startsWith("#") || line.startsWith("//")) {
            return;
        }

        if (line.startsWith("forward")) {
            return this.validateForwardStatement(line, lineNumber, port);
        }

        if (line.startsWith("set") || line.startsWith("unset")) {
            return this.validateSetAndUnsetStatement(line, lineNumber);
        }

        if (line.startsWith("assign")) {
            return this.validateAssignStatement(line, lineNumber, port);
        }

        return [
            {
                line: lineNumber,
                message: "Unknown statement",
            },
        ];
    }

    private validateForwardStatement(
        line: string,
        lineNumber: number,
        port: DfdOutputPortImpl,
    ): PortBehaviorValidationError[] | undefined {
        const match = line.match(PortBehaviorValidator.FORWARDING_REGEX);
        if (!match) {
            return [
                {
                    line: lineNumber,
                    message: "invalid forwarding(Template: forward <i>input_pins</i>)",
                },
            ];
        }

        const inputsString = line.substring("forward ".length);
        const inputs = inputsString.split(",").map((input) => input.trim());
        if (inputs.filter((input) => input !== "").length === 0) {
            return [
                {
                    line: lineNumber,
                    message: "forward needs at least one input",
                },
            ];
        }

        const emptyInput = inputs.findIndex((input) => input === "");
        if (emptyInput !== -1) {
            // Find position of empty input given the index of the empty input.
            let emptyInputPosition = line.indexOf(",");
            for (let i = 1; i < emptyInput; i++) {
                emptyInputPosition = line.indexOf(",", emptyInputPosition + 1);
            }

            return [
                {
                    line: lineNumber,
                    message: "trailing comma without being followed by an input",
                    colStart: emptyInputPosition,
                    colEnd: emptyInputPosition + 1,
                },
            ];
        }

        const duplicateInputs = inputs.filter((input) => inputs.filter((i) => i === input).length > 1);
        if (duplicateInputs.length > 0) {
            const distinctDuplicateInputs = [...new Set(duplicateInputs)];

            return distinctDuplicateInputs.flatMap((input) => {
                // find all occurrences of the duplicate input
                const indices = [];
                let idx = line.indexOf(input);
                while (idx !== -1) {
                    // Ensure this is not a substring of another input by
                    // ensuring the character before and after the input are not alphanumeric.
                    // E.g. Input "te" should not detect input "test" as a duplicate of "te".
                    if (
                        !line[idx - 1]?.match(PortBehaviorValidator.REGEX_ALPHANUMERIC) &&
                        !line[idx + input.length]?.match(PortBehaviorValidator.REGEX_ALPHANUMERIC)
                    ) {
                        indices.push(idx);
                    }

                    idx = line.indexOf(input, idx + 1);
                }

                // Create an error for each occurrence of the duplicate input
                return indices.map((index) => ({
                    line: lineNumber,
                    message: `duplicate input: ${input}`,
                    colStart: index,
                    colEnd: index + input.length,
                }));
            });
        }

        const node = port.parent;
        if (!(node instanceof DfdNodeImpl)) {
            throw new Error("Expected port parent to be a DfdNodeImpl.");
        }

        const availableInputs = node.getAvailableInputs();

        const unavailableInputs = inputs.filter((input) => !availableInputs.includes(input));
        if (unavailableInputs.length > 0) {
            return unavailableInputs.map((input) => {
                let foundCorrectInput = false;
                let idx = line.indexOf(input);
                while (!foundCorrectInput) {
                    // Ensure this is not a substring of another input.
                    // Same as above.
                    foundCorrectInput =
                        !line[idx - 1]?.match(PortBehaviorValidator.REGEX_ALPHANUMERIC) &&
                        !line[idx + input.length]?.match(PortBehaviorValidator.REGEX_ALPHANUMERIC);

                    if (!foundCorrectInput) {
                        idx = line.indexOf(input, idx + 1);
                    }
                }

                return {
                    line: lineNumber,
                    message: `invalid/unknown input: ${input}`,
                    colStart: idx,
                    colEnd: idx + input.length,
                };
            });
        }

        return undefined;
    }

    private validateSetAndUnsetStatement(line: string, lineNumber: number): PortBehaviorValidationError[] | undefined {
        const match = line.match(PortBehaviorValidator.SET_AND_UNSET_REGEX);
        if (!match) {
            return [
                {
                    line: lineNumber,
                    message:
                        "invalid assignment(Template:" +
                        (line.startsWith("set") ? "set" : "unset") +
                        " <i>out_labels</i>)",
                },
            ];
        }

        const inputAccessErrors = [];

        const outLabel = line
            .substring((line.startsWith("set") ? "set" : "unset").length + 1)
            .trim()
            .split(",")
            .map((variable) => variable.trim());

        for (const typeValuePair of outLabel) {
            if (typeValuePair === "") continue;

            const inputLabelType = typeValuePair.split(".")[0].trim();
            const inputLabelTypeObject = this.labelTypeRegistry
                ?.getLabelTypes()
                .find((type) => type.name === inputLabelType);
            if (!inputLabelTypeObject) {
                let idx = line.indexOf(inputLabelType);
                while (idx !== -1) {
                    // Check that this is not a substring of another label type.
                    if (
                        // must start after a dot and end before a dot
                        line[idx - 1] === "." &&
                        line[idx + inputLabelType.length] === "."
                    ) {
                        inputAccessErrors.push({
                            line: lineNumber,
                            message: `unknown label type: ${inputLabelType}`,
                            colStart: idx,
                            colEnd: idx + inputLabelType.length,
                        });
                    }

                    idx = line.indexOf(inputLabelType, idx + 1);
                }
            }

            if (typeValuePair.indexOf(".") !== -1) {
                if (typeValuePair.split(".")[1] === null || typeValuePair.split(".")[1] === "") continue;
                const inputLabelValue = typeValuePair.split(".")[1].trim();

                const inputLabelTypeObject = this.labelTypeRegistry
                    ?.getLabelTypes()
                    .find((type) => type.name === inputLabelType);
                if (!inputLabelTypeObject) {
                    let idx = line.indexOf(inputLabelType);
                    while (idx !== -1) {
                        // Check that this is not a substring of another label type.
                        if (
                            // must start after a dot and end before a dot
                            line[idx - 1] === "." &&
                            line[idx + inputLabelType.length] === "."
                        ) {
                            inputAccessErrors.push({
                                line: lineNumber,
                                message: `unknown label type: ${inputLabelType}`,
                                colStart: idx,
                                colEnd: idx + inputLabelType.length,
                            });
                        }

                        idx = line.indexOf(inputLabelType, idx + 1);
                    }
                } else if (!inputLabelTypeObject.values.find((value) => value.text === inputLabelValue)) {
                    let idx = line.indexOf(inputLabelValue);
                    while (idx !== -1) {
                        // Check that this is not a substring of another label value.
                        if (
                            // must start after a dot and end at the end of the alphanumeric text
                            line[idx - 1] === "." &&
                            // Might be at the end of the line
                            (!line[idx + inputLabelValue.length] ||
                                !line[idx + inputLabelValue.length].match(PortBehaviorValidator.REGEX_ALPHANUMERIC))
                        ) {
                            inputAccessErrors.push({
                                line: lineNumber,
                                message: `unknown label value of label type ${inputLabelType}: ${inputLabelValue}`,
                                colStart: idx,
                                colEnd: idx + inputLabelValue.length,
                            });
                        }

                        idx = line.indexOf(inputLabelValue, idx + 1);
                    }
                }
            }

            if (typeValuePair.split(".")[2] !== undefined) {
                inputAccessErrors.push({
                    line: lineNumber,
                    message: `invalid label definition`,
                });
            }
        }

        return inputAccessErrors.length > 0 ? inputAccessErrors : [];
    }

    private validateAssignStatement(
        line: string,
        lineNumber: number,
        port: DfdOutputPortImpl,
    ): PortBehaviorValidationError[] | undefined {
        const match = line.match(PortBehaviorValidator.ASSIGNMENT_REGEX);
        if (!match) {
            return [
                {
                    line: lineNumber,
                    message: "invalid assignment(Template:assign out_labels if term from in_pins)",
                },
            ];
        }

        // Extract all used inputs, label types and the corresponding label values.
        let term = match[2];

        const termMatch = term.match(PortBehaviorValidator.TERM_REGEX);
        if (term == "" || !termMatch) {
            return [
                {
                    line: lineNumber,
                    message: "invalid term",
                },
            ];
        }

        const matches = [
            ...term.matchAll(new RegExp("(" + PortBehaviorValidator.OUTPUT_LABEL_REGEX.source + ")", "g")),
        ];
        const inputAccessErrors = [];

        console.log(matches);

        for (const inputMatch of matches) {
            const inputLabelType = inputMatch[1];
            const inputLabelValue = inputMatch[2];

            const inputLabelTypeObject = this.labelTypeRegistry
                ?.getLabelTypes()
                .find((type) => type.name === inputLabelType);
            if (!inputLabelTypeObject) {
                let idx = line.indexOf(inputLabelType);
                while (idx !== -1) {
                    // Check that this is not a substring of another label type.
                    if (
                        // must start after a dot and end before a dot
                        line[idx - 1] === "." &&
                        line[idx + inputLabelType.length] === "."
                    ) {
                        inputAccessErrors.push({
                            line: lineNumber,
                            message: `unknown label type: ${inputLabelType}`,
                            colStart: idx,
                            colEnd: idx + inputLabelType.length,
                        });
                    }

                    idx = line.indexOf(inputLabelType, idx + 1);
                }
            } else if (
                inputLabelValue === undefined ||
                inputLabelValue === "" ||
                !inputLabelTypeObject.values.find((value) => value.text === inputLabelValue)
            ) {
                let idx = line.indexOf(inputLabelValue);
                while (idx !== -1) {
                    // Check that this is not a substring of another label value.
                    if (
                        // must start after a dot and end at the end of the alphanumeric text
                        line[idx - 1] === "." &&
                        // Might be at the end of the line
                        (!line[idx + inputLabelValue.length] ||
                            !line[idx + inputLabelValue.length].match(PortBehaviorValidator.REGEX_ALPHANUMERIC))
                    ) {
                        inputAccessErrors.push({
                            line: lineNumber,
                            message: `unknown label value of label type ${inputLabelType}: ${inputLabelValue}`,
                            colStart: idx,
                            colEnd: idx + inputLabelValue.length,
                        });
                    }

                    idx = line.indexOf(inputLabelValue, idx + 1);
                }
            }

            console.log(inputMatch);

            if (inputMatch[3] !== undefined) {
                inputAccessErrors.push({
                    line: lineNumber,
                    message: `invalid label definition`,
                });
            }
        }

        const node = port.parent;
        if (!(node instanceof DfdNodeImpl)) {
            throw new Error("Expected port parent to be a DfdNodeImpl.");
        }
        const availableInputs = node.getAvailableInputs();

        const outLabel = match[1].split(",").map((variable) => variable.trim());
        const inPorts = match[3] ? match[3].split(",").map((variable) => variable.trim()) : [];

        // Check for each input access that the input exists and that the label type and value are valid.

        for (const inPortName of inPorts) {
            if (!availableInputs.includes(inPortName) && inPortName !== "") {
                // Find all occurrences of the unavailable input.
                let idx = line.indexOf(inPortName);
                inputAccessErrors.push({
                    line: lineNumber,
                    message: `invalid/unknown input: ${inPortName}`,
                    colStart: idx,
                    colEnd: idx + inPortName.length,
                });

                continue;
            }
        }

        for (const typeValuePair of outLabel) {
            if (typeValuePair === "") continue;

            const inputLabelType = typeValuePair.split(".")[0].trim();
            const inputLabelTypeObject = this.labelTypeRegistry
                ?.getLabelTypes()
                .find((type) => type.name === inputLabelType);
            if (!inputLabelTypeObject) {
                let idx = line.indexOf(inputLabelType);
                while (idx !== -1) {
                    // Check that this is not a substring of another label type.
                    if (
                        // must start after a dot and end before a dot
                        line[idx - 1] === "." &&
                        line[idx + inputLabelType.length] === "."
                    ) {
                        inputAccessErrors.push({
                            line: lineNumber,
                            message: `unknown label type: ${inputLabelType}`,
                            colStart: idx,
                            colEnd: idx + inputLabelType.length,
                        });
                    }

                    idx = line.indexOf(inputLabelType, idx + 1);
                }
            }

            if (typeValuePair.indexOf(".") !== -1) {
                if (typeValuePair.split(".")[1] === null || typeValuePair.split(".")[1] === "") continue;
                const inputLabelValue = typeValuePair.split(".")[1].trim();

                const inputLabelTypeObject = this.labelTypeRegistry
                    ?.getLabelTypes()
                    .find((type) => type.name === inputLabelType);
                if (!inputLabelTypeObject) {
                    let idx = line.indexOf(inputLabelType);
                    while (idx !== -1) {
                        // Check that this is not a substring of another label type.
                        if (
                            // must start after a dot and end before a dot
                            line[idx - 1] === "." &&
                            line[idx + inputLabelType.length] === "."
                        ) {
                            inputAccessErrors.push({
                                line: lineNumber,
                                message: `unknown label type: ${inputLabelType}`,
                                colStart: idx,
                                colEnd: idx + inputLabelType.length,
                            });
                        }

                        idx = line.indexOf(inputLabelType, idx + 1);
                    }
                } else if (!inputLabelTypeObject.values.find((value) => value.text === inputLabelValue)) {
                    let idx = line.indexOf(inputLabelValue);
                    while (idx !== -1) {
                        // Check that this is not a substring of another label value.
                        if (
                            // must start after a dot and end at the end of the alphanumeric text
                            line[idx - 1] === "." &&
                            // Might be at the end of the line
                            (!line[idx + inputLabelValue.length] ||
                                !line[idx + inputLabelValue.length].match(PortBehaviorValidator.REGEX_ALPHANUMERIC))
                        ) {
                            inputAccessErrors.push({
                                line: lineNumber,
                                message: `unknown label value of label type ${inputLabelType}: ${inputLabelValue}`,
                                colStart: idx,
                                colEnd: idx + inputLabelValue.length,
                            });
                        }

                        idx = line.indexOf(inputLabelValue, idx + 1);
                    }
                }
            }

            if (typeValuePair.split(".")[2] !== undefined) {
                inputAccessErrors.push({
                    line: lineNumber,
                    message: `invalid label definition`,
                });
            }
        }

        return inputAccessErrors.length > 0 ? inputAccessErrors : [];
    }

    private static BUILD_COMMA_SEPARATED_LIST_REGEX(regex: RegExp): RegExp {
        return new RegExp(regex.source + "(?:, *" + regex.source + ")*");
    }
}
