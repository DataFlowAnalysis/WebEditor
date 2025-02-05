import { inject, injectable } from "inversify";
import {
    ActionDispatcher,
    Command,
    CommandExecutionContext,
    CommandReturn,
    CommitModelAction,
    SLabelImpl,
    SModelRootImpl,
    TYPES,
} from "sprotty";
import { getBasicType, LayoutAction, RedoAction, UndoAction } from "sprotty-protocol";
import { DfdNodeImpl } from "../dfdElements/nodes";
import { SettingsManager } from "./SettingsManager";
import {
    ChangeEdgeLabelVisibilityAction,
    ChangeThemeAction,
    CompleteLayoutProcessAction,
    SimplifyNodeNamesAction,
} from "./actions";
import { ArrowEdgeImpl } from "../dfdElements/edges";
import { createDefaultFitToScreenAction } from "../../utils";
import { LayoutMethod } from "./LayoutMethod";
import { Theme, ThemeManager } from "./themeManager";

@injectable()
export class NodeNameReplacementRegistry {
    private registry: Map<string, string> = new Map();
    private nextNumber = 1;

    public get(id: string) {
        const v = this.registry.get(id);
        if (v !== undefined) {
            return v;
        }
        const newName = this.nextNumber.toString();
        this.nextNumber++;
        this.registry.set(id, newName);
        return newName;
    }
}

@injectable()
export class SimplifyNodeNamesCommand extends Command {
    static readonly KIND = SimplifyNodeNamesAction.KIND;

    constructor(
        @inject(TYPES.Action) private action: SimplifyNodeNamesAction,
        @inject(SettingsManager) private settings: SettingsManager,
        @inject(NodeNameReplacementRegistry) private registry: NodeNameReplacementRegistry,
    ) {
        super();
    }

    execute(context: CommandExecutionContext): CommandReturn {
        return this.perform(context, this.action.mode);
    }
    undo(context: CommandExecutionContext): CommandReturn {
        return this.perform(context, this.action.mode === "hide" ? "show" : "hide");
    }
    redo(context: CommandExecutionContext): CommandReturn {
        return this.perform(context, this.action.mode);
    }

    private perform(context: CommandExecutionContext, mode: SimplifyNodeNamesAction.Mode): SModelRootImpl {
        this.settings.simplifyNodeNames = mode === "hide";
        const nodes = context.root.children.filter((node) => getBasicType(node) === "node") as DfdNodeImpl[];
        nodes.forEach((node) => {
            const label = node.children.find((element) => element.type === "label:positional") as
                | SLabelImpl
                | undefined;
            if (!label) {
                return;
            }
            label.text = mode === "hide" ? this.registry.get(node.id) : node.text ?? "";
        });
        return context.root;
    }
}

@injectable()
export class ChangeEdgeLabelVisibilityCommand extends Command {
    static readonly KIND = ChangeEdgeLabelVisibilityAction.KIND;

    constructor(
        @inject(TYPES.Action) private action: ChangeEdgeLabelVisibilityAction,
        @inject(SettingsManager) private settings: SettingsManager,
    ) {
        super();
    }

    execute(context: CommandExecutionContext): CommandReturn {
        return this.perform(context, this.action.hide);
    }
    undo(context: CommandExecutionContext): CommandReturn {
        return this.perform(context, !this.action.hide);
    }
    redo(context: CommandExecutionContext): CommandReturn {
        return this.perform(context, this.action.hide);
    }

    private perform(context: CommandExecutionContext, hide: boolean): SModelRootImpl {
        this.settings.hideEdgeLabels = hide;
        const edges = context.root.children.filter((node) => getBasicType(node) === "edge") as ArrowEdgeImpl[];
        edges.forEach((edge) => {
            const label = edge.children.find((element) => element.type === "label:filled-background") as
                | SLabelImpl
                | undefined;
            if (!label) {
                return;
            }
            label.text = hide ? "" : edge.text ?? "";
        });

        return context.root;
    }
}

@injectable()
export class CompleteLayoutProcessCommand extends Command {
    static readonly KIND = CompleteLayoutProcessAction.KIND;
    private previousMethod?: LayoutMethod;

    constructor(
        @inject(TYPES.Action) private action: CompleteLayoutProcessAction,
        @inject(TYPES.IActionDispatcher) private actionDispatcher: ActionDispatcher,
        @inject(SettingsManager) private settings: SettingsManager,
    ) {
        super();
    }

    execute(context: CommandExecutionContext): CommandReturn {
        console.info("CompleteLayoutProcessCommand", this.action.method);
        this.previousMethod = this.settings.layoutMethod;
        this.settings.layoutMethod = this.action.method;
        this.actionDispatcher.dispatchAll([
            LayoutAction.create(),
            CommitModelAction.create(),
            createDefaultFitToScreenAction(context.root),
        ]);
        return context.root;
    }
    undo(context: CommandExecutionContext): CommandReturn {
        this.settings.layoutMethod = this.previousMethod ?? LayoutMethod.LINES;
        this.actionDispatcher.dispatch(UndoAction.create());
        return context.root;
    }
    redo(context: CommandExecutionContext): CommandReturn {
        this.previousMethod = this.settings.layoutMethod;
        this.settings.layoutMethod = this.action.method;
        this.actionDispatcher.dispatch(RedoAction.create());
        return context.root;
    }
}

@injectable()
export class ChangeThemeCommand extends Command {
    static readonly KIND = ChangeThemeAction.KIND;
    private previousTheme?: Theme;

    constructor(
        @inject(TYPES.Action) private action: ChangeThemeAction,
        @inject(ThemeManager) private themeManager: ThemeManager,
    ) {
        super();
    }

    execute(context: CommandExecutionContext): CommandReturn {
        this.previousTheme = this.themeManager.theme;
        this.themeManager.theme = this.action.theme;
        return context.root;
    }
    undo(context: CommandExecutionContext): CommandReturn {
        this.themeManager.theme = this.previousTheme ?? Theme.SYSTEM_DEFAULT;
        return context.root;
    }
    redo(context: CommandExecutionContext): CommandReturn {
        this.previousTheme = this.themeManager.theme;
        this.themeManager.theme = this.action.theme;
        return context.root;
    }
}
