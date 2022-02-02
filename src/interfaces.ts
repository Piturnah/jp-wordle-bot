import { Snowflake } from "discord.js";

export enum SpecialTurnResponse {
    WrongPlayer,
    WonGame,
    BadGuess,
    NotAWord,
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
    leave(player: Snowflake): Snowflake | boolean;
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
