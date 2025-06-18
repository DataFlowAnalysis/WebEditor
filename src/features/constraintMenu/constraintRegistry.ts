import { injectable } from "inversify";

@injectable()
export class ConstraintRegistry {
    private constraints: string = "";
    private updateCallbacks: (() => void)[] = [];

    public setConstraints(constraints: string): void {
        this.constraints = constraints;
        this.constraintListChanged();
    }

    public clearConstraints(): void {
        this.constraints = "";
        this.constraintListChanged();
    }

    public constraintListChanged(): void {
        this.updateCallbacks.forEach((cb) => cb());
    }

    public onUpdate(callback: () => void): void {
        this.updateCallbacks.push(callback);
    }

    public getConstraints(): string {
        return this.constraints;
    }
}
