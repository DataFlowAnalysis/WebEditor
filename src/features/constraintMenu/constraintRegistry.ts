import { injectable } from "inversify";

export interface Constraint {
    id: string;
    name: string;
    constraint: string;
}

@injectable()
export class ConstraintRegistry {
    private constraints: Constraint[] = [];
    private updateCallbacks: (() => void)[] = [];

    public registerConstraint(constraint: Constraint): void {
        this.constraints.push(constraint);
        this.constraintListChanged();
    }

    public unregisterConstraint(constraint: Constraint): void {
        this.constraints = this.constraints.filter((c) => c.id !== constraint.id);
        this.constraintListChanged();
    }

    public clearConstraints(): void {
        this.constraints = [];
        this.constraintListChanged();
    }

    public constraintListChanged(): void {
        this.updateCallbacks.forEach((cb) => cb());
    }

    public onUpdate(callback: () => void): void {
        this.updateCallbacks.push(callback);
    }

    public getConstraints(): Constraint[] {
        return this.constraints;
    }

    public getConstraint(id: string): Constraint | undefined {
        return this.constraints.find((c) => c.id === id);
    }
}
