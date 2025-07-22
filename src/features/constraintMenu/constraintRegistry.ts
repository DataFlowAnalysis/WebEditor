import { injectable } from "inversify";

export interface Constraint {
    name: string;
    constraint: string;
}

@injectable()
export class ConstraintRegistry {
    private constraints: Constraint[] = [];
    private updateCallbacks: (() => void)[] = [];

    public setConstraints(constraints: string[]): void {
        this.constraints = this.splitIntoConstraintTexts(constraints).map((c) => this.mapToConstraint(c));
    }

    public setConstraintsFromArray(constraints: Constraint[]): void {
        this.constraints = constraints.map((c) => ({
            name: c.name,
            constraint: c.constraint,
        }));
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

    public getConstraintsAsText(): string {
        return this.constraints.map((c) => `- ${c.name}: ${c.constraint}`).join("\n");
    }

    public getConstraintList(): Constraint[] {
        return this.constraints;
    }

    private splitIntoConstraintTexts(text: string[]): string[] {
        const constraints: string[] = [];
        let currentConstraint = "";
        for (const line of text) {
            if (line.startsWith("- ")) {
                if (currentConstraint !== "") {
                    constraints.push(currentConstraint);
                }
                currentConstraint = line;
            } else {
                currentConstraint += `\n${line}`;
            }
        }
        if (currentConstraint !== "") {
            constraints.push(currentConstraint);
        }
        return constraints;
    }

    private mapToConstraint(constraint: string): Constraint {
        // the brackets ensure its a capturing split
        const parts = constraint.split(/(\s+)/);
        // if less than 3 parts are present no name or constraint can be extracted (e.g. "- " -> ["-", " "])
        if (parts.length < 3) {
            return { name: "", constraint: "" };
        }
        let name = parts[2];
        if (name.endsWith(":")) {
            name = name.slice(0, -1);
        }
        let constraintText = "";
        // the first 4 parts are "- ", whitespace, `${name}:`, whitespace --> Thus the constraint starts at index 4
        for (let i = 4; i < parts.length; i++) {
            constraintText += parts[i];
        }
        return { name, constraint: constraintText };
    }
}
