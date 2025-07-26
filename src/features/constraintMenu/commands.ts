import { inject, injectable } from "inversify";
import { Command, CommandExecutionContext, CommandReturn, TYPES } from "sprotty";
import { DfdNodeImpl } from "../dfdElements/nodes";
import { ChooseConstraintAction } from "./actions";
import { getBasicType } from "sprotty-protocol";
import { AnnnotationsManager } from "../settingsMenu/annotationManager";
import { ConstraintRegistry } from "./constraintRegistry";

@injectable()
export class ChooseConstraintCommand extends Command {
    static readonly KIND = ChooseConstraintAction.KIND;

    constructor(
        @inject(TYPES.Action) private action: ChooseConstraintAction,
        @inject(AnnnotationsManager) private annnotationsManager: AnnnotationsManager,
        @inject(ConstraintRegistry) private constraintRegistry: ConstraintRegistry,
    ) {
        super();
    }

    execute(context: CommandExecutionContext): CommandReturn {
        this.annnotationsManager.clearTfgs();
        let names = this.action.names;
        this.constraintRegistry.setSelectedConstraints(names);

        if (names.includes("INITIAL_CONSTRAINT_STATE")) {
            this.constraintRegistry.setAllConstraintsAsSelected();
            names = this.constraintRegistry.getSelectedConstraints();
        }

        const nodes = context.root.children.filter((node) => getBasicType(node) === "node") as DfdNodeImpl[];
        if (names.length === 0) {
            nodes.forEach((node) => {
                node.setColor("#1D1C22");
            });
            return context.root;
        }

        nodes.forEach((node) => {
            const annotations = node.annotations!;
            let wasAdjusted = false;
            if (this.constraintRegistry.selectedContainsAllConstraints()) {
                annotations.forEach((annotation) => {
                    if (annotation.message.startsWith("Constraint")) {
                        wasAdjusted = true;
                        node.setColor(annotation.color!);
                    }
                });
            }
            names.forEach((name) => {
                annotations.forEach((annotation) => {
                    if (annotation.message.startsWith("Constraint ") && annotation.message.split(" ")[1] === name) {
                        node.setColor(annotation.color!);
                        wasAdjusted = true;
                        this.annnotationsManager.addTfg(annotation.tfg!);
                    }
                });
            });
            if (!wasAdjusted) node.setColor("#1D1C22");
        });

        nodes.forEach((node) => {
            const inTFG = node.annotations!.filter((annotation) =>
                this.annnotationsManager.getSelectedTfgs().has(annotation.tfg!),
            );
            if (inTFG.length > 0) node.setColor("#77777A", false);
        });

        return context.root;
    }

    undo(context: CommandExecutionContext): CommandReturn {
        return context.root;
    }
    redo(context: CommandExecutionContext): CommandReturn {
        return context.root;
    }
}
