import { Snowflake } from "discord.js";

export enum SpecialTurnResponse {
    WrongPlayer,
    WonGame,
    BadGuess,
}

export enum CharState {
    Wrong,
    Moved,
    Correct,
}

export enum State {
    Setup,
    Running,
}

export interface WordLists {
    fourKana: string[];
    fiveKana?: string[];
    sixKana?: string[];
}

export interface Game {
    getState(): State;
    join(player: Snowflake): boolean;
    start(player: Snowflake): boolean;
    nextGuessExpectedFrom(): Snowflake;
    makeGuess(
        player: Snowflake,
        guess: string,
    ): SpecialTurnResponse | CharState[];
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
    imageSize: number = 50;
    marginBottom: number = 12;
    fontSize: number = 40;
    borderSize: number = 1;
}
export class Default implements RenderDimensions {
    imageSize: number = 200;
    marginBottom: number = 36;
    fontSize: number = 180;
    borderSize: number = 2;
}

export class DefaultColors implements Colors {
    wrong: string = "#FFFFFF"; // White
    right: string = "#65E43C"; // Atlantis
    wrongPosition: string = "#E6CD2E"; // Sunflower
}

export class RenderParameters {
    colors: Colors = new DefaultColors();
    dimensions: RenderDimensions = new Default();
}

export function resolve(charResult: CharState, colors: Colors): string {
    switch (charResult) {
        case CharState.Correct:
            return colors.right;
        case CharState.Moved:
            return colors.wrongPosition;
        case CharState.Wrong:
        default:
            return colors.wrong;
    }
}

export interface Renderer {
    render(
        word: string,
        guessResult: CharState[],
        parameters?: RenderParameters,
    ): Buffer;
}
