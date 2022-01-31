import { Snowflake } from "discord.js";

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
	start(): boolean;
	nextGuessExpectedFrom(): Snowflake;
	join(player: Snowflake): boolean;
	makeGuess(player: Snowflake, guess: string): boolean | CharState[];
}
