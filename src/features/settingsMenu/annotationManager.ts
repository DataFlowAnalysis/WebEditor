import { injectable } from "inversify";

export enum Mode {
    INCOMING = "Incoming Labels",
    OUTGOING = "Outgoing Labels",
    ALL = "All Labels",
}

@injectable()
export class AnnnotationsManager {
    private selectedTfgs = new Set<number>();

    public getSelectedTfgs(): Set<number> {
        return this.selectedTfgs;
    }
    public clearTfgs() {
        this.selectedTfgs = new Set<number>();
    }
    public addTfg(hash: number) {
        this.selectedTfgs.add(hash);
    }

    constructor() {}
}
