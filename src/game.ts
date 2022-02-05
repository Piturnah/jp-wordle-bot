import { Snowflake } from "discord.js";

import { CharState, SpecialTurnResponse } from "./interfaces";
import { WordLists } from "./word_lists";

export class Settings {
    timeout? = 25000;
}

function shuffle<T>(array: T[]): T[] {
    const result = array.slice(0);
    for (let i = result.length - 1; i > 0; i--) {
        const j = Math.floor(Math.random() * (i + 1));
        [result[i], result[j]] = [result[j], result[i]];
    }
    return result;
}

export class Session {
    private readonly channel: Snowflake;
    private players: Snowflake[];
    private owner: Snowflake;

    private settings = new Settings();
    private activeGame?: Game = undefined;

    constructor(channel: Snowflake, owner: Snowflake) {
        this.channel = channel;
        this.owner = owner;
        this.players = [owner];
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
                if (this.owner === player) {
                    this.owner = this.players[0];
                    return this.owner;
                }
                return false;
            }
        }
        return false;
    }

    start(
        player: Snowflake,
        onTimeout: (player: Snowflake, channelId: Snowflake) => void,
    ): Game | boolean {
        if (undefined !== this.activeGame) {
            return true;
        } else if (player !== this.owner) {
            return false;
        } else {
            this.activeGame = new Game(
                shuffle(this.players),
                (player) => onTimeout(player, this.channel),
                { ...this.settings },
            );
            return this.activeGame;
        }
    }
}

export class Game {
    private players: Snowflake[];
    private currentPlayer = 0;
    private timer: ReturnType<typeof setTimeout> | undefined = undefined;
    private onTimeout: (player: Snowflake) => void;
    private settings: Settings;

    wordKeys: string[];
    guessesSoFar: string[] = [];
    word: string;

    constructor(
        players: Snowflake[],
        timeoutCallback: (player: Snowflake) => void,
        settings: Settings,
    ) {
        this.players = players;
        this.onTimeout = timeoutCallback;
        this.settings = settings;

        this.wordKeys = Array.from(WordLists.fourKana.keys());
        this.word =
            this.wordKeys[Math.floor(Math.random() * this.wordKeys.length)];
        console.log(this.word);
    }

    nextGuessExpectedFrom(): Snowflake {
        return this.players[this.currentPlayer];
    }

    makeGuess(
        player: Snowflake,
        guess: string,
    ): SpecialTurnResponse | CharState[] {
        if (player !== this.players[this.currentPlayer]) {
            return SpecialTurnResponse.WrongPlayer;
        } else if (guess.length !== this.word.length) {
            return SpecialTurnResponse.BadGuess;
        } else if (guess === this.word) {
            if (this.timer !== undefined) {
                clearTimeout(this.timer);
            }
            return SpecialTurnResponse.WonGame;
        } else if (this.wordKeys.indexOf(guess) === -1) {
            return SpecialTurnResponse.NotAWord;
        } else {
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
    }

    private updatePlayerIndex(index?: number) {
        if (index !== undefined) {
            this.currentPlayer = index;
        } else {
            this.currentPlayer = (this.currentPlayer + 1) % this.players.length;
        }

        if (this.timer !== undefined) {
            clearTimeout(this.timer);
        }
        this.timer = setTimeout(() => this.timeout(), this.settings.timeout);
    }

    private timeout() {
        const delayedPlayer = this.players[this.currentPlayer];
        this.updatePlayerIndex();
        this.onTimeout(delayedPlayer);
    }
}
