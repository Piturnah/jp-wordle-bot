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

export interface Game {
	getState(): State;
	join(player: Snowflake): boolean;
	start(player: Snowflake): boolean;
	nextGuessExpectedFrom(): Snowflake;
	makeGuess(
		player: Snowflake,
		guess: string
	): SpecialTurnResponse | CharState[];
}

export interface Colors {
	wrong: string;
	right: string;
	wrongPosition: string;
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

export class DefaultColors implements Colors {
	wrong: string = "#Ffffff"; // White
	right: string = "#65e43c"; // Atlantis
	wrongPosition: string = "#e6cd2e"; // Sunflower
}

export interface Renderer {
	render(word: string, guessResult: CharState[], colors?: Colors): Buffer;
}
