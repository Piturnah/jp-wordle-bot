import { CharResult } from "../interfaces";
import { Game, GameParams } from "./Game";

export class Free extends Game {
    constructor(params: GameParams) {
        super(params);

        this.params.messages.gameStarted(this.params.word.word.length, {
            guessCount: this.guesses,
            maxGuessCount: this.params.options.maxAttempts,
        });
    }

    protected playersAllowedToGuess(): string[] | "all" {
        return "all";
    }

    protected left() {
        // no additional steps required..
    }

    incorrectGuessMade(player: string, result: CharResult[]): void {
        this.params.messages.feedback(player, result, {
            guessCount: this.guesses,
            maxGuessCount: this.params.options.maxAttempts,
        });
    }

    cleanUpInternal(): void {
        // nothing to do as there is no timer for this mode..
    }
}
