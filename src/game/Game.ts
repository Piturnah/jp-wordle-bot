import { Snowflake, TextBasedChannel, User } from "discord.js";

import { CommandParser, ListenerId } from "../commands";
import { CharResult, Result } from "../interfaces";
import { ListManager, WordWithDetails } from "../list_manager";
import { Messages, RevealReason } from "../messages";
import { Options } from "./Options";
import { WithInactivityTimeout } from "./WithInactivityTimeout";

export type GameResult =
    | "timeOut"
    | "correct"
    | "guessesExhausted"
    | "revealed"
    | "noPlayersLeft"
    | "couldNotCreateChannels";

export function generateResult(word: string, guess: string): CharResult[] {
    const result: CharResult[] = new Array(word.length);
    for (let i = 0; i < word.length; i++) {
        const guessedCharacter = guess.charAt(i);
        if (guessedCharacter === word.charAt(i)) {
            result[i] = {
                character: guessedCharacter,
                result: Result.Correct,
            };
        } else {
            // We only want to highlight a specific character as many times
            // as it actually occurs in the word-to-be-guessed.
            // To that end, we compute how many times the characters occur in both words,
            // and then check if the index of the current occurence in the guess already
            // exceeds the total amount of occurenes in the actual word, and if yes,
            // also treat this occurence as wrong.
            const numberOfOccurencesInWordWithoutExactMatches = indicesWith(
                word,
                guessedCharacter,
            ).filter(
                (index) => guessedCharacter !== guess.charAt(index),
            ).length;
            const guessIndices = indicesWith(guess, guessedCharacter);
            if (
                guessIndices.indexOf(i) <
                numberOfOccurencesInWordWithoutExactMatches
            ) {
                result[i] = {
                    character: guessedCharacter,
                    result: Result.Moved,
                };
            } else {
                result[i] = {
                    character: guessedCharacter,
                    result: Result.Wrong,
                };
            }
        }
    }
    return result;
}

function indicesWith(target: string, character: string) {
    const indices: number[] = [];

    for (
        let index = target.indexOf(character);
        index > -1;
        index = target.indexOf(character, index + 1) // TODO: Index shift?
    ) {
        indices.push(index);
    }

    return indices;
}

export interface GameParams {
    readonly word: WordWithDetails;
    readonly commandParser: CommandParser;
    readonly listManager: ListManager;
    readonly messages: Messages;
    readonly channel: TextBasedChannel;
    readonly options: Options;
    readonly whenOver: () => void;
    readonly leave: (player: Snowflake) => number | "empty" | "notFound";
    readonly players: User[];
    readonly owner: () => Snowflake;
}

export abstract class Game extends WithInactivityTimeout {
    protected readonly params: GameParams;

    private ended?: GameResult = undefined;
    protected guesses = 0;
    private listeners: ListenerId[];

    constructor(params: GameParams) {
        super();
        this.params = params;
        this.listeners = this.setupListeners(this.params.commandParser);
    }

    private ifAllowed(
        player: Snowflake,
        allowedPlayers: Snowflake[] | "all",
        then: () => void,
    ) {
        if (
            undefined === this.ended &&
            ("all" === allowedPlayers || allowedPlayers.indexOf(player) > -1)
        ) {
            // it's important if unintuitive to reset the timer beforehand,
            // as then() might actually cause the session to end..
            this.restartInactivityTimer();
            then();
            return true;
        }
        return false;
    }

    private setupListeners(commandParser: CommandParser): ListenerId[] {
        return [
            commandParser.register({
                channel: this.params.channel.id,
                regEx: /!leave/,
                listener: (player) =>
                    this.ifAllowed(
                        //
                        player.id,
                        "all",
                        () => this.leave(player.id),
                    ),
            }),

            commandParser.register({
                channel: this.params.channel.id,
                regEx: /!reveal/,
                listener: (player) =>
                    this.ifAllowed(
                        //
                        player.id,
                        [this.params.owner()],
                        () => this.reveal(),
                    ),
            }),

            commandParser.register({
                channel: this.params.channel.id,
                regEx: /(?<guess>\S+)/,
                listener: (player, input) =>
                    this.ifAllowed(
                        player.id,
                        this.playersAllowedToGuess(),
                        () => this.makeGuess(player.id, input.guess),
                    ),
            }),
        ];
    }

    protected outOfGuesses(): void {
        this.params.messages
            .reveal(this.params.word, RevealReason.GuessesExhausted)
            .then(() => this.endedWith("guessesExhausted"));
    }

    protected guessesExhausted(): boolean {
        return (
            undefined !== this.params.options.maxAttempts &&
            0 >= this.params.options.maxAttempts - this.guesses
        );
    }

    leave(player: Snowflake): void {
        const result = this.params.leave(player);
        if ("notFound" === result) {
            // do nothing
        } else if ("empty" === result) {
            this.params.messages
                .reveal(this.params.word, RevealReason.NoPlayersLeft)
                .then(() => this.endedWith("noPlayersLeft"))
                .catch(() => this.endedWith("noPlayersLeft"));
        } else {
            this.left(result, player);
        }
    }

    makeGuess(player: Snowflake, guess: string): void {
        if (guess.length !== this.params.word.word.length) {
            // For now, do nothing here.
        } else if (
            this.params.options.checkWords &&
            !this.params.listManager.checkGlobal(
                this.params.options.language,
                guess,
            )
        ) {
            this.params.messages.unknownWord(guess);
        } else {
            this.guesses++;
            const result = generateResult(this.params.word.word, guess);
            if (
                result.every(
                    (charResult) => Result.Correct === charResult.result,
                )
            ) {
                this.params.messages
                    .guessedCorrectly(result, player)
                    .then(() => this.endedWith("correct"));
            } else {
                if (!this.guessesExhausted()) {
                    this.incorrectGuessMade(player, result);
                    // if (Mode.Turns === this.options.mode) {
                    // } else if (Mode.Free === this.options.mode) {
                    //     this.messages.feedback(player, result, {
                    //         guessCount: this.guessCount,
                    //         maxGuessCount: this.options.maxAttempts,
                    //     });
                    // }
                } else {
                    this.params.messages
                        .feedback(player, result, {
                            guessCount: this.guesses,
                            maxGuessCount: this.params.options.maxAttempts,
                        })
                        .then(() => this.outOfGuesses());
                }
            }
        }
    }

    private reveal() {
        this.params.messages
            .reveal(this.params.word, RevealReason.Revealed)
            .then(() => this.endedWith("revealed"))
            .catch(() => this.endedWith("revealed"));
    }

    abstract incorrectGuessMade(player: Snowflake, result: CharResult[]): void;

    protected inactivityTimeout() {
        this.params.messages
            .reveal(this.params.word, RevealReason.Inactivity)
            .then(() => this.endedWith("timeOut"))
            .catch(() => this.endedWith("timeOut"));
    }

    abstract cleanUpInternal(): void;

    cleanUp() {
        this.stopInactivityTimer();
        this.params.commandParser.remove(...this.listeners);
        this.cleanUpInternal();
    }

    protected abstract playersAllowedToGuess(): Snowflake[] | "all";

    protected abstract left(index: number, player: Snowflake): void;

    protected endedWith(result: GameResult) {
        this.ended = result;
        this.cleanUp();
        this.params.whenOver();
    }
}
