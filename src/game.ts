import { MessagePayload, Snowflake, TextChannel } from "discord.js";
import { Logger } from "tslog";

import { CommandParser } from "./commands";
import { CharResult, Result, State } from "./interfaces";
import { ListIdentifier, ListManager } from "./list_manager";
import { Basic as Renderer } from "./renderer";

class Options {
    checkWords = false;
    turnTimeout = 25000;
    lobbyTimeout = 60000;
    multiRound = false;
    // TODO: This value is currently not used.
    maxRounds? = 0;
    wordLength?: number;
    maxGuessesFactor? = 4;
    language = "jp";
}

enum TimerUsecase {
    Turn,
    Lobby,
}

export class Game {
    private readonly listManager: ListManager;
    private readonly channel: TextChannel;
    private readonly commandParser: CommandParser;
    private readonly renderer;
    private readonly logger = new Logger();

    private options = new Options();
    private state: State;
    private guessCount = 0;

    private players: Snowflake[];
    private createdPlayer: Snowflake;
    private playerIndex = 0;
    private currentTimeout: undefined | ReturnType<typeof setTimeout> =
        undefined;

    private word?: string = undefined;
    private currentList?: ListIdentifier = undefined;

    constructor(
        player: Snowflake,
        channel: TextChannel,
        commandParser: CommandParser,
        listManager: ListManager,
        renderer: Renderer,
    ) {
        this.state = State.Setup;
        this.channel = channel;
        this.commandParser = commandParser;
        this.createdPlayer = player;
        this.players = [this.createdPlayer];

        this.listManager = listManager;

        this.renderer = renderer;

        this.setupListeners(commandParser);
        this.startTimer(TimerUsecase.Lobby);
    }

    private setupListeners(commandParser: CommandParser): void {
        commandParser.registerChannelListener(
            this.channel.id,
            /!join/,
            (_channel, player) => {
                this.join(player);
                return true;
            },
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!leave/,
            (_channel, player) => {
                this.leave(player);
                return true;
            },
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!start/,
            (_channel, player) => {
                this.start(player);
                return true;
            },
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /(?<guess>\S+)/,
            (_channel, player, guess) => {
                this.makeGuess(player, guess[0]);
                return true;
            },
        );
    }

    getState(): State {
        return this.state;
    }

    join(player: Snowflake): void {
        if (State.Setup === this.state) {
            this.startTimer(TimerUsecase.Lobby);
            if (this.players.indexOf(player) < 0) {
                this.players.push(player);
                this.channel.send(`Player <@${player}> has joined the lobby!`);
            }
        }
    }

    leave(player: Snowflake): void {
        if (State.Setup === this.state) {
            this.startTimer(TimerUsecase.Lobby);

            const index = this.players.indexOf(player);
            if (-1 !== index) {
                this.players.splice(index, 1);
                if (this.players.length === 0) {
                    this.state = State.Ended;
                    this.channel.send(
                        `Game ended as last player left the lobby!`,
                    );
                    this.cleanUp();
                } else {
                    if (this.createdPlayer === player) {
                        this.createdPlayer = this.players[0];
                        this.channel.send(
                            `With <@${player}> leaving the lobby, <@${this.createdPlayer}> is now the session owner!`,
                        );
                        this.playerIndex %= this.players.length;
                    }
                }
            }
        }
    }

    start(player: Snowflake) {
        if (State.Setup === this.state) {
            if (player === this.createdPlayer) {
                if (undefined === this.currentList) {
                    this.currentList =
                        this.listManager.getDefaultListForLanguage(
                            this.options.language,
                        );
                }
                if (undefined === this.currentList) {
                    this.logger.error(
                        "Could not get default list for language",
                        this.options.language,
                        "!",
                    );
                } else {
                    this.word = this.listManager.randomWord(
                        this.currentList,
                        this.options.wordLength,
                    );

                    if (undefined !== this.word) {
                        this.logger.debug(
                            "New game has started in channel",
                            this.channel.id,
                            ", word to be guessed is",
                            this.word,
                        );

                        this.state = State.Running;

                        this.updatePlayerIndex(this.playerIndex);

                        this.feedback(
                            new Array(this.word.length).fill({
                                character: " ",
                                result: Result.Wrong,
                            }),
                            `Who can guess the word with ${
                                this.word.length
                            } characters? <@${
                                this.players[this.playerIndex]
                            }> will be the first to guess..`,
                        );
                    } else {
                        this.logger.error(
                            "Could not get word with length",
                            this.options.wordLength,
                            "from list",
                            this.currentList.getUserString(),
                        );
                    }
                }
            }
        }
    }

    private feedback(guessResult: CharResult[], additionalText?: string) {
        MessagePayload.resolveFile(this.renderer.render(guessResult)).then(
            (file) =>
                this.channel.send({ content: additionalText, files: [file] }),
        );
    }

    nextGuessExpectedFrom(): Snowflake {
        return this.players[this.playerIndex];
    }

    makeGuess(player: Snowflake, guess: string): void {
        if (undefined !== this.word) {
            if (player !== this.players[this.playerIndex]) {
                // For now, do nothing here.
            } else if (guess.length !== this.word.length) {
                // For now, do nothing here.
            } else if (
                this.options.checkWords &&
                !this.listManager.checkGlobal(this.options.language, guess)
            ) {
                this.channel.send(
                    `Hmmm... I do not know "${guess}". Please try another word..`,
                );
            }
            // this should never happen, but ESLint forces us into the undefined check
            else {
                const result = Game.generateResult(this.word, guess);
                if (
                    result.every(
                        (charResult) => Result.Correct === charResult.result,
                    )
                ) {
                    this.feedback(
                        result,
                        `Wow, <@${player}>! <@${
                            this.players[this.playerIndex]
                        }> got it right! Dropping you back to the lobby..`,
                    );
                    this.dropBackToLobby();
                } else {
                    if (!this.guessesExhausted(this.guessCount++)) {
                        this.updatePlayerIndex();
                        if (this.players.length > 1) {
                            this.feedback(
                                result,
                                `Close, <@${player}>! <@${
                                    this.players[this.playerIndex]
                                }> is up next!`,
                            );
                        } else {
                            this.feedback(
                                result,
                                `Not quite! Try again, <@${player}>!`,
                            );
                        }
                    } else {
                        this.feedback(result, `Close, <@${player}>!`);
                        this.outOfGuesses();
                    }
                }
            }
        }
    }

    private outOfGuesses(): void {
        if (undefined !== this.word) {
            this.feedback(
                Game.generateResult(this.word, this.word),
                `... out of guesses! This was the correct word. Dropping you back into the lobby..`,
            );
        }
        this.dropBackToLobby();
    }

    private guessesExhausted(guesses: number): boolean {
        return (
            undefined !== this.options.maxGuessesFactor &&
            guesses >= this.options.maxGuessesFactor * this.players.length
        );
    }

    private dropBackToLobby(): void {
        // this.playerIndex is purposefully not reset.
        this.startTimer(TimerUsecase.Lobby);
        this.guessCount = 0;
        this.word = undefined;
        this.state = State.Setup;
    }

    private static generateResult(word: string, guess: string): CharResult[] {
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
                const numberOfOccurencesInWordWithoutExactMatches =
                    Game.indicesWith(word, guessedCharacter).filter(
                        (index) => guessedCharacter !== guess.charAt(index),
                    ).length;
                const guessIndices = Game.indicesWith(guess, guessedCharacter);
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

    private static indicesWith(target: string, character: string) {
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

    private updatePlayerIndex(index?: number) {
        if (index !== undefined) {
            this.playerIndex = index;
        } else {
            this.playerIndex = (this.playerIndex + 1) % this.players.length;
        }

        this.startTimer(TimerUsecase.Turn);
    }

    startTimer(callback: TimerUsecase) {
        if (this.currentTimeout !== undefined) {
            clearTimeout(this.currentTimeout);
        }

        switch (callback) {
            case TimerUsecase.Turn:
                this.currentTimeout = setTimeout(() => {
                    this.playerTimedOut();
                }, this.options.turnTimeout);
                break;
            case TimerUsecase.Lobby:
                this.currentTimeout = setTimeout(() => {
                    this.lobbyTimedOut();
                }, this.options.lobbyTimeout);
                break;
        }
    }

    private lobbyTimedOut() {
        this.channel.send(
            "Game has been cancelled due to inactivity.. Restart at any time with '!start.'.",
        );
        this.cleanUp();
    }

    private cleanUp() {
        if (this.currentTimeout !== undefined) {
            clearTimeout(this.currentTimeout);
        }
        this.state = State.Ended;
        this.commandParser.removeAllForChannel(this.channel.id);
    }

    private playerTimedOut() {
        const currentPlayer = this.players[this.playerIndex];
        if (!this.guessesExhausted(this.guessCount++)) {
            this.updatePlayerIndex();
            this.channel.send(
                `<@${currentPlayer}> took to long to answer! <@${
                    this.players[this.playerIndex]
                }> is up next.`,
            );
        } else {
            this.outOfGuesses();
        }
    }
}
