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
	nextGuessExpectedFrom(): Snowflake;
	join(player: Snowflake): boolean;
	start(player: Snowflake): boolean;
	nextGuessExpectedFrom(): Snowflake;
	makeGuess(player: Snowflake, guess: string): boolean | CharState[];
}
