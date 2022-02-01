import { debug } from "console";
import { Snowflake } from "discord.js";
import {
    SpecialTurnResponse,
    CharState,
    State,
    Game as GameData,
} from "./interfaces";

const timeoutTime = 15000;

export class Game implements GameData {
    state: State;
    channelId: Snowflake;
    players: Snowflake[];
    createdPlayer: Snowflake;
    playerIndex: number;
    currentTimeout: undefined | ReturnType<typeof setTimeout>;
    timeoutCallback: (player: Snowflake, channelId: Snowflake) => void;

    words: string[];
    word: string;

    constructor(
        player: Snowflake,
        channelId: Snowflake,
        timeoutCallback: (player: Snowflake, channelId: Snowflake) => void,
    ) {
        this.state = State.Setup;
        this.channelId = channelId;
        this.createdPlayer = player;
        this.players = [this.createdPlayer];
        this.playerIndex = 0;
        this.currentTimeout = undefined;
        this.timeoutCallback = timeoutCallback;

        this.words = ["まいとし"];
        this.word = this.words[Math.floor(Math.random() * this.words.length)];
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
        this.updatePlayerIndex(0);
        this.state = State.Running;
        return true;
    }

    nextGuessExpectedFrom(): Snowflake {
        return this.players[this.playerIndex];
    }

    makeGuess(
        player: Snowflake,
        guess: string,
    ): SpecialTurnResponse | CharState[] {
        if (player !== this.players[this.playerIndex]) {
            return SpecialTurnResponse.WrongPlayer;
        }
        if (guess.length !== this.word.length) {
            return SpecialTurnResponse.BadGuess;
        }
        if (guess === this.word) {
            return SpecialTurnResponse.WonGame;
        }

        const chars: CharState[] = [];
        for (let i = 0; i < guess.length; i++) {
            if (this.word.charAt(i) === guess.charAt(i)) {
                chars[i] = CharState.Correct;
            } else if (this.word.indexOf(guess.charAt(i)) > -1) {
                chars[i] = CharState.Moved;
            } else {
                chars[i] = CharState.Wrong;
            }
        }

        this.updatePlayerIndex();

        return chars;
    }

    updatePlayerIndex(index?: number) {
        if (index !== undefined) {
            this.playerIndex = index;
        } else {
            this.playerIndex = (this.playerIndex + 1) % this.players.length;
        }

        if (this.currentTimeout !== undefined) {
            clearTimeout(this.currentTimeout);
        }
        this.currentTimeout = setTimeout(() => {
            this.callTimeoutCallback();
        }, timeoutTime);
    }

    callTimeoutCallback() {
        const delayedPlayer = this.players[this.playerIndex];
        this.updatePlayerIndex();
        this.timeoutCallback(delayedPlayer, this.channelId);
    }
}
