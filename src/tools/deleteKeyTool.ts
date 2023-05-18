import { ContainerModule, inject, injectable } from "inversify";
import { DeleteElementAction, KeyListener, KeyTool, SModelElement, Tool, isDeletable, isSelectable } from "sprotty";
import { Action } from "sprotty-protocol";
import { matchesKeystroke } from "sprotty/lib/utils/keyboard";
import { EDITOR_TYPES } from "../utils";

@injectable()
export class DelKeyDeleteTool implements Tool {
    static ID = "delete-keyboard";

    protected deleteKeyListener: DeleteKeyListener = new DeleteKeyListener();

    @inject(KeyTool) protected readonly keytool: KeyTool = new KeyTool();

    get id(): string {
        return DelKeyDeleteTool.ID;
    }

    enable(): void {
        this.keytool.register(this.deleteKeyListener);
    }

    disable(): void {
        this.keytool.deregister(this.deleteKeyListener);
    }
}

@injectable()
export class DeleteKeyListener extends KeyListener {
    override keyDown(element: SModelElement, event: KeyboardEvent): Action[] {
        if (matchesKeystroke(event, "Delete")) {
            const deleteElementIds = Array.from(
                element.root.index
                    .all()
                    .filter((e) => isDeletable(e) && isSelectable(e) && e.selected)
                    .filter((e) => e.id !== e.root.id)
                    .map((e) => e.id),
            );
            if (deleteElementIds.length > 0) {
                return [DeleteElementAction.create(deleteElementIds)];
            }
        }
        return [];
    }
}

export const deleteKeyDeleteTool = new ContainerModule((bind) => {
    bind(DelKeyDeleteTool).toSelf().inSingletonScope();
    bind(EDITOR_TYPES.IDefaultTool).toService(DelKeyDeleteTool);
});