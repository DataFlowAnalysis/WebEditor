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

    public setConstraints(constraints: string): void {
        this.constraints = ConstraintRegistry.splitToConstraintTexts(constraints).map((t) =>
            this.constraintFromText(t.text),
        );
        //this.constraintListChanged();
    }

    public setConstraintsFromArray(constraints: Constraint[]): void {
        this.constraints = constraints.map((c) => ({
            id: c.id || generateRandomSprottyId(),
            name: c.name,
            constraint: c.constraint,
        }));
        this.constraintListChanged();
    }

    private constraintFromText(text: string): Constraint {
        const parts = text.split(" ");
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

    public static splitToConstraintTexts(text: string): { text: string; line: number }[] {
        if (text === "") {
            return [];
        }
        const lines = text.split(/\r?\n/gm);
        let currentConstraint = "";
        const constraints: { text: string; line: number }[] = [];
        let lastStart = 0;
        for (let i = 0; i < lines.length; i++) {
            const line = lines[i].trim();
            if (line.startsWith("-")) {
                if (currentConstraint) {
                    constraints.push({ text: currentConstraint, line: lastStart });
                }
                lastStart = i;
                currentConstraint = line;
            } else {
                currentConstraint += `\n${line}`;
            }
        }
        return currentConstraint ? [...constraints, { text: currentConstraint, line: lastStart }] : constraints;
    }
}
