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
        console.log("add", this.constraints);
        this.constraintChanged();
    }

    public unregisterConstraint(constraint: Constraint): void {
        this.constraints = this.constraints.filter((c) => c.id !== constraint.id);
        console.log("rem", this.constraints);
        this.constraintChanged();
    }

    public clearConstraints(): void {
        this.constraints = [];
        this.constraintChanged();
    }

    public constraintChanged(): void {
        this.updateCallbacks.forEach((cb) => cb());
    }

    public onUpdate(callback: () => void): void {
        this.updateCallbacks.push(callback);
    }

    public getConstraints(): Constraint[] {
        console.log("get", this.constraints);
        return this.constraints;
    }

    public getConstraint(id: string): Constraint | undefined {
        return this.constraints.find((c) => c.id === id);
    }
}
