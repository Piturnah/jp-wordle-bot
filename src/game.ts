import { Snowflake } from "discord.js";

import {
    CharState,
    Game as GameData,
    SpecialTurnResponse,
    State,
} from "./interfaces";
import { WordLists } from "./word_lists";

const timeoutTime = 25000;

export class Game implements GameData {
    state: State;
    channelId: Snowflake;
    players: Snowflake[];
    createdPlayer: Snowflake;
    playerIndex: number;
    currentTimeout: undefined | ReturnType<typeof setTimeout>;
    timeoutCallback: (player: Snowflake, channelId: Snowflake) => void;

    wordKeys: string[];
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

        this.wordKeys = Array.from(WordLists.fourKana.keys());
        this.word =
            this.wordKeys[Math.floor(Math.random() * this.wordKeys.length)];
        console.log(this.word);
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

    leave(player: Snowflake): Snowflake | boolean {
        const index = this.players.indexOf(player);
        if (-1 !== index) {
            this.players.splice(index, 1);
            if (this.players.length === 0) {
                return true;
            } else {
                if (this.createdPlayer === player) {
                    this.createdPlayer = this.players[0];
                    return this.createdPlayer;
                }
                return false;
            }
        }
        return false;
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
            if (this.currentTimeout !== undefined)
                clearTimeout(this.currentTimeout);
            return SpecialTurnResponse.WonGame;
        }
        if (this.wordKeys.indexOf(guess) === -1) {
            return SpecialTurnResponse.NotAWord;
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
