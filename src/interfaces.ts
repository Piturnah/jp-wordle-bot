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

export interface Renderer {
	render(word: string, guessResult: CharState[]): Buffer;
}
