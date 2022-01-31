import { Snowflake } from "discord.js";
import { CharState, State } from "./interfaces";

export class Game {
    state: State;
    players: Snowflake[];
    createdPlayer: Snowflake;

    words: string[];
    word: string;

    constructor(player: Snowflake) {
        this.state = State.Setup;
        this.createdPlayer = player;
        this.players = [this.createdPlayer];

        this.words = [
            "まいとし"
        ];
        this.word = this.words[Math.floor(Math.random()*this.words.length)];
    }

    getState() {
        return this.state;
    }

    start() {
        if (this.state === State.Running) {
            return false;
        }
        this.state = State.Running;
    }

    join(player: Snowflake) {

        // Player already in players
        if (this.players.indexOf(player) > -1) {
            return false;
        }

        this.players.push(player);
    }

    makeGuess(player: Snowflake, guess: string,): boolean | CharState[] {
        if (guess === this.word) {
            return true;
        }
        if (guess.length !== this.word.length) {
            return false;
        }

        const chars: CharState[] = [];
        for (let i = 0; i < guess.length; i++) {
            if (this.word.charAt(i) === guess.charAt(i)) {
                chars[i] = CharState.Wrong;
            } else if (this.word.indexOf(guess.charAt(i)) > -1) {
                chars[i] = CharState.Moved;
            } else {
                chars[i] = CharState.Wrong;
            }
        }

        return chars;
    }
}