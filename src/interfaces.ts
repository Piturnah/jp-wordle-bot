export interface CharResult {
    character: string;
    result: Result;
}

export enum Result {
    Wrong,
    Moved,
    Correct,
}

export enum State {
    Setup,
    Running,
    Ended,
}

export interface Colors {
    wrong: string;
    right: string;
    wrongPosition: string;
}

export interface RenderDimensions {
    imageSize: number;
    marginBottom: number;
    fontSize: number;
    borderSize: number;
}

export class Small implements RenderDimensions {
    imageSize = 50;
    marginBottom = 12;
    fontSize = 40;
    borderSize = 1;
}
export class Default implements RenderDimensions {
    imageSize = 200;
    marginBottom = 36;
    fontSize = 180;
    borderSize = 2;
}

export class DefaultColors implements Colors {
    wrong = "#FFFFFF"; // White
    right = "#65E43C"; // Atlantis
    wrongPosition = "#E6CD2E"; // Sunflower
}

export class RenderParameters {
    colors: Colors = new DefaultColors();
    dimensions: RenderDimensions = new Default();
}

export function resolve(result: Result, colors: Colors): string {
    switch (result) {
        case Result.Correct:
            return colors.right;
        case Result.Moved:
            return colors.wrongPosition;
        case Result.Wrong:
        default:
            return colors.wrong;
    }
}

export interface Renderer {
    render(guessResult: CharResult[], parameters?: RenderParameters): Buffer;
}
