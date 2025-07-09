import { injectable } from "inversify";
import { generateRandomSprottyId } from "../../utils";

export interface Constraint {
    id: string;
    name: string;
    constraint: string;
}

@injectable()
export class ConstraintRegistry {
    private constraints: Constraint[] = [];
    private updateCallbacks: (() => void)[] = [];
    private selectedConstraints: string[] = ["ALL"];

    public setConstraints(constraints: string): void {
        const lines = constraints
            .trim()
            .split(/\r?\n(?=-)/)
            .map((line) => line.trim())
            .filter((line) => line.length > 0);

        this.constraints = lines.map(this.constraintFromLine);
        this.constraintListChanged();
    }

    public setConstraintsFromArray(constraints: Constraint[]): void {
        this.constraints = constraints.map((c) => ({
            id: c.id || generateRandomSprottyId(),
            name: c.name,
            constraint: c.constraint,
        }));
        this.constraintListChanged();
    }

    public setSelectedConstraints(constraints: string[]): void {
        this.selectedConstraints = constraints;
    }

    public getSelectedConstraints(): string[] {
        return this.selectedConstraints;
    }

    private constraintFromLine(line: string): Constraint {
        const parts = line.split(" ");
        if (parts.length < 2) {
            return {
                id: generateRandomSprottyId(),
                name: "",
                constraint: "",
            };
        }
        const name = parts[1].endsWith(":") ? parts[1].slice(0, -1) : parts[1];
        if (parts.length < 3) {
            return {
                id: generateRandomSprottyId(),
                name: name,
                constraint: "",
            };
        }
        return {
            id: generateRandomSprottyId(),
            name: name,
            constraint: parts.slice(2).join(" "),
        };
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

    public getConstraintsAsText(): string {
        return this.constraints.map((c) => `- ${c.name}: ${c.constraint}`).join("\n");
    }

    public getConstraintList(): Constraint[] {
        return this.constraints;
    }
}
