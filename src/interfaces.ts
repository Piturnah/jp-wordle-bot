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
	state(): State;
	join(player: Snowflake): boolean;
	start(player: Snowflake): boolean;
	nextGuessExpectedFrom(): Snowflake;
	makeGuess(player: Snowflake, guess: string): boolean | CharState[];
}
