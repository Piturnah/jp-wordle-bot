import { Snowflake } from "discord.js";

import {
    CharState,
    Game as GameData,
    SpecialTurnResponse,
    State,
} from "./interfaces";
import { ListIdentifier, ListManager } from "./list_manager";

const timeoutTime = 25000;
const lobbyTimeoutTime = 60000;

enum TimeoutCallback {
    Player,
    Lobby,
}

export class Game implements GameData {
    state: State;
    channelId: Snowflake;
    players: Snowflake[];
    createdPlayer: Snowflake;
    playerIndex: number;
    currentTimeout: undefined | ReturnType<typeof setTimeout>;
    timeoutCallback: (player: Snowflake, channelId: Snowflake) => void;
    lobbyTimeoutCallback: (player: Snowflake, channelId: Snowflake) => void;

    word: string;
    currentList: ListIdentifier;
    listManager: ListManager;

    constructor(
        player: Snowflake,
        channelId: Snowflake,
        timeoutCallback: (player: Snowflake, channelId: Snowflake) => void,
        lobbyTimeoutCallback: (player: Snowflake, channelId: Snowflake) => void,
        listManager: ListManager,
        list: ListIdentifier,
    ) {
        this.state = State.Setup;
        this.channelId = channelId;
        this.createdPlayer = player;
        this.players = [this.createdPlayer];
        this.playerIndex = 0;
        this.currentTimeout = undefined;
        this.timeoutCallback = timeoutCallback;
        this.lobbyTimeoutCallback = lobbyTimeoutCallback;
        this.listManager = listManager;
        this.currentList = list;

        this.word = listManager.randomWord(this.currentList, 4) ?? ""; // TODO

        this.setTimeoutCallback(TimeoutCallback.Lobby);

        console.log(this.word);
    }

    getState(): State {
        return this.state;
    }

    join(player: Snowflake): boolean {
        this.setTimeoutCallback(TimeoutCallback.Lobby);

        // Player already in players
        if (this.players.indexOf(player) > -1) {
            return false;
        }

        this.players.push(player);
        return true;
    }

    leave(player: Snowflake): Snowflake | boolean {
        this.setTimeoutCallback(TimeoutCallback.Lobby);

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
        if (!this.listManager.checkGlobal(this.currentList.language, guess)) {
            return SpecialTurnResponse.NotAWord;
        }

        const chars: CharState[] = Array(this.word.length).fill(
            CharState.Wrong,
        );
        for (let i = 0; i < this.word.length; i++) {
            // Case: letter is in guess
            if (guess.indexOf(this.word.charAt(i)) > -1) {
                const res: number[] = [];
                guess.replaceAll(
                    this.word.charAt(i),
                    function (match, offset: number) {
                        res.push(offset);
                        return match;
                    },
                );
                if (res.indexOf(i) > -1) {
                    chars[i] = CharState.Correct;
                } else {
                    chars[res[0]] = CharState.Moved;
                }
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

        this.setTimeoutCallback(TimeoutCallback.Player);
    }

    setTimeoutCallback(callback: TimeoutCallback) {
        if (this.currentTimeout !== undefined) {
            clearTimeout(this.currentTimeout);
        }

        switch (callback) {
            case TimeoutCallback.Player:
                this.currentTimeout = setTimeout(() => {
                    this.callTimeoutCallback(TimeoutCallback.Player);
                }, timeoutTime);
                break;
            case TimeoutCallback.Lobby:
                this.currentTimeout = setTimeout(() => {
                    this.callTimeoutCallback(TimeoutCallback.Lobby);
                }, lobbyTimeoutTime);
                break;
        }
    }

    callTimeoutCallback(callback: TimeoutCallback) {
        switch (callback) {
            case TimeoutCallback.Player: {
                const delayedPlayer = this.players[this.playerIndex];
                this.updatePlayerIndex();
                this.timeoutCallback(delayedPlayer, this.channelId);
                break;
            }
            case TimeoutCallback.Lobby:
                this.lobbyTimeoutCallback(this.createdPlayer, this.channelId);
                break;
        }
    }
}
