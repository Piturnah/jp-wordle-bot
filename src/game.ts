import { Snowflake } from "discord.js";
import { CharState, State, Game as GameData} from "./interfaces";

export class Game implements GameData {
    state: State;
    players: Snowflake[];
    createdPlayer: Snowflake;
    playerIndex: number;

    words: string[];
    word: string;

    constructor(player: Snowflake) {
        this.state = State.Setup;
        this.createdPlayer = player;
        this.players = [this.createdPlayer];
        this.playerIndex = 0;

        this.words = [
            "まいとし"
        ];
        this.word = this.words[Math.floor(Math.random()*this.words.length)];
    }

    getState(): State {
        return this.state;
    }

    join(player: Snowflake): boolean {

        // Player already in players
        if (this.players.indexOf(player) > -1) {
            return false;
        }

        this.players.push(player);
        return true;
    }

    start(player: Snowflake): boolean {
        if (player !== this.createdPlayer) {
            return false;
        }
        this.state = State.Running;
        return true;
    }
    
    nextGuessExpectedFrom(): Snowflake {
        return this.players[this.playerIndex];
    }

    makeGuess(player: Snowflake, guess: string,): boolean | CharState[] {
        if (guess === this.word) {
            return true;
        }
        if (player !== this.players[this.playerIndex] || guess.length !== this.word.length) {
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

        this.playerIndex = (this.playerIndex + 1) % this.players.length;
        return chars;
    }
}