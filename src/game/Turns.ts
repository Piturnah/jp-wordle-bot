import { Snowflake } from "discord.js";

import { CharResult } from "../interfaces";
import { Game, GameParams } from "./Game";

export class Turns extends Game {
    private turnTimeout: ReturnType<typeof setTimeout>;
    private playerIndex: number;

    constructor(params: GameParams) {
        super(params);

        this.playerIndex = Math.floor(
            Math.random() * this.params.players.length,
        );

        this.params.messages.gameStarted(this.params.word.word.length, {
            nextPlayer: this.params.players[this.playerIndex],
            guessCount: this.guesses,
            maxGuessCount: this.params.options.maxAttempts,
        });

        this.turnTimeout = this.restartRoundTimer();
    }

    incorrectGuessMade(player: string, result: CharResult[]): void {
        this.advancePlayerIndex();

        if (this.params.players.length > 1) {
            this.params.messages.feedback(player, result, {
                nextPlayer: this.params.players[this.playerIndex],
                guessCount: this.guesses,
                maxGuessCount: this.params.options.maxAttempts,
            });
        } else {
            this.params.messages.feedback(player, result, {
                guessCount: this.guesses,
                maxGuessCount: this.params.options.maxAttempts,
            });
        }

        this.restartRoundTimer();
    }

    private advancePlayerIndex() {
        this.playerIndex = (this.playerIndex + 1) % this.params.players.length;
    }

    cleanUpInternal(): void {
        if (undefined !== this.turnTimeout) {
            clearTimeout(this.turnTimeout);
        }
    }

    protected playersAllowedToGuess(): string[] {
        return [this.nextGuessExpectedFrom()];
    }

    nextGuessExpectedFrom(): Snowflake {
        return this.params.players[this.playerIndex];
    }

    protected left(index: number): void {
        if (index === this.playerIndex) {
            // because we already removed the player,
            // this.playerIndex is already pointing to the next player
            this.playerIndex %= this.params.players.length;
            this.params.messages.promptPlayerTurn(
                this.params.players[this.playerIndex],
            );
            this.restartRoundTimer();
        } else if (index < this.playerIndex) {
            // to maintain the current player
            this.playerIndex--;
        }
    }

    private restartRoundTimer(): ReturnType<typeof setTimeout> {
        if (this.turnTimeout !== undefined) {
            clearTimeout(this.turnTimeout);
        }

        this.turnTimeout = setTimeout(
            () => this.playerTimedOut(),
            this.params.options.turnTimeout,
        );
        return this.turnTimeout;
    }

    private playerTimedOut() {
        const currentPlayer = this.params.players[this.playerIndex];
        this.guesses++;
        if (!this.guessesExhausted()) {
            this.advancePlayerIndex();
            if (this.params.players.length > 1) {
                this.params.messages.turnTimeout(currentPlayer, {
                    nextPlayer: this.params.players[this.playerIndex],
                    guessCount: this.guesses,
                    maxGuessCount: this.params.options.maxAttempts,
                });
            } else {
                this.params.messages.turnTimeout(currentPlayer, {
                    guessCount: this.guesses,
                    maxGuessCount: this.params.options.maxAttempts,
                });
            }
            this.restartRoundTimer();
        } else {
            this.outOfGuesses();
        }
    }
}
