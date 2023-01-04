import {
    Snowflake,
    TextBasedChannel,
    TextChannel,
    ThreadChannel,
} from "discord.js";
import { Logger } from "tslog";

import { CommandParser } from "./commands";
import { CharResult, Result, State } from "./interfaces";
import {
    LengthRange,
    ListIdentifier,
    ListManager,
    WordWithDetails,
} from "./list_manager.js";
import { Messages, RevealReason } from "./messages";
import { Basic as Renderer } from "./renderer";
import { SettingsDb } from "./settings_db";
import { StatsTracker } from "./stats_tracker";

const MAX_INACTIVE_TIME = 180000;

export enum Mode {
    Turns = "turns",
    Free = "free",
}

/// Serialized type, must not have non-static functions!
export class Options {
    mode = Mode.Free;
    checkWords = false;
    turnTimeout = 60000;
    maxAttempts? = 12;
    language = "en";
    listIdentifier?: ListIdentifier;
    lengthRange: LengthRange = new LengthRange(4, 5);
    useThreads = false;
    reportStats = true;
}

export class Game {
    private readonly settingsDb: SettingsDb;
    private readonly listManager: ListManager;
    private readonly commandParser: CommandParser;
    private readonly logger: Logger;
    private readonly channel: TextBasedChannel;
    private readonly messages: Messages;
    private readonly tracker: StatsTracker;

    private options: Options;
    private originalOwner = true;
    private state: State;
    private guessCount = 0;

    private players: Snowflake[];
    private owner: Snowflake;
    private playerIndex = 0;
    private inactiveTimeout: ReturnType<typeof setTimeout>;
    private turnTimeout?: ReturnType<typeof setTimeout> = undefined;

    private word?: WordWithDetails = undefined;

    constructor(
        logger: Logger,
        player: Snowflake,
        channel: TextBasedChannel,
        commandParser: CommandParser,
        listManager: ListManager,
        renderer: Renderer,
        settingsDb: SettingsDb,
        options: Options,
        tracker: StatsTracker,
        players: Snowflake[] = [player],
    ) {
        this.logger = logger;
        this.state = State.Setup;
        this.channel = channel;
        this.commandParser = commandParser;
        this.owner = player;
        this.players = players;

        this.settingsDb = settingsDb;

        this.options = options;
        this.tracker = tracker;

        this.listManager = listManager;
        if (undefined === this.options.listIdentifier) {
            this.options.listIdentifier =
                this.listManager.getDefaultListForLanguage(
                    this.options.language,
                );
        }

        this.messages = new Messages(
            renderer,
            channel,
            this.logger.getChildLogger(),
        );

        this.setupListeners(commandParser);

        this.messages.lobbyText(this.owner, this.options);

        this.inactiveTimeout = setTimeout(
            () => this.cancelDueToInactivity(),
            MAX_INACTIVE_TIME,
        );
    }

    private ifAllowed(
        player: Snowflake,
        states: State[],
        players: Snowflake[],
        then: () => void,
    ) {
        if (
            states.indexOf(this.state) > -1 &&
            (players.length === 0 || players.indexOf(player) > -1)
        ) {
            // it's important if unintuitive to reset the timer beforehand,
            // as then() might actually cause the session to end..
            this.resetInactivityTimer();
            then();
            return true;
        }
        return false;
    }

    private setupListeners(commandParser: CommandParser): void {
        commandParser.registerChannelListener(
            this.channel.id,
            /!join/,
            (player) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup],
                    [],
                    () => this.join(player),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!leave/,
            (player) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup, State.Running],
                    [],
                    () => this.leave(player),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!reveal/,
            (player) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Running],
                    [this.owner],
                    () => this.reveal(),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!start/,
            (player) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup],
                    [this.owner],
                    () => this.start(),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /(?<guess>\S+)/,
            (player, input) =>
                this.ifAllowed(
                    player,
                    [State.Running],
                    Mode.Turns === this.options.mode
                        ? [this.players[this.playerIndex]]
                        : [],
                    () => this.makeGuess(player, input.guess.toLowerCase()),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!list/,
            (player) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup],
                    [this.owner],
                    () => this.printCurrentListInfo(),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!list (?<language>\w+)\/(?<list>\w+)/,
            (player, input) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup],
                    [this.owner],
                    () => this.switchToList(input.language, input.list),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!threads/,
            (player) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup],
                    [this.owner],
                    () => this.switchUseThreads(),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!toggleUsageStatistics/,
            (player) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup],
                    [this.owner],
                    () => this.toggleUserStatistics(),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!length (?<min>[1-9]\d*)( (?<max>[1-9]\d*))?/,
            (player, input) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup],
                    [this.owner],
                    () =>
                        this.setWordLength(
                            parseInt(input.min),
                            parseInt(
                                undefined !== input.max
                                    ? input.max.trim()
                                    : input.min,
                            ),
                        ),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!mode (?<mode>turns|free)/,
            (player, input) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup],
                    [this.owner],
                    () => this.setMode(input.mode),
                ),
        );

        commandParser.registerChannelListener(
            this.channel.id,
            /!guesses ((?<guessCount>[1-9]\d*)|(?<unlimited>unlimited))/,
            (player, input) =>
                this.ifAllowed(
                    //
                    player,
                    [State.Setup],
                    [this.owner],
                    () =>
                        this.setMaxGuesses(
                            undefined !== input.guessCount
                                ? parseInt(input.guessCount)
                                : undefined,
                        ),
                ),
        );
    }

    toggleUserStatistics(): void {
        this.options.reportStats = !this.options.reportStats;
        this.storeSettings();
        this.messages.userStatisticsToggled(this.options.reportStats);
    }

    private setMaxGuesses(guesses?: number) {
        const previousGuessCount = this.options.maxAttempts;
        this.options.maxAttempts = guesses;
        this.messages.maxGuessesChanged(guesses);
        if (previousGuessCount !== guesses) {
            this.storeSettings();
        }
    }

    private setMode(modeAsString: string) {
        const prevMode = this.options.mode;
        let newMode = prevMode;
        switch (modeAsString) {
            case Mode.Turns:
                newMode = Mode.Turns;
                break;
            case Mode.Free:
                newMode = Mode.Free;
                break;
            default:
                this.logger.error(
                    "User managed to enter unknown mode string:",
                    modeAsString,
                );
                break;
        }

        if (prevMode !== newMode) {
            this.options.mode = newMode;
            this.messages.modeChanged(newMode);
            this.storeSettings();
        }
    }

    private setWordLength(min: number, max: number) {
        if (undefined !== this.options.listIdentifier) {
            if (min > max) {
                // fancy trick to swap the values without temporary
                max = [min, (min = max)][0];
            }
            const wordsLength = new LengthRange(min, max);
            if (
                undefined !==
                this.listManager.randomWord(
                    this.options.listIdentifier,
                    wordsLength,
                )
            ) {
                this.options.lengthRange = wordsLength;
                this.storeSettings();
                this.messages.wordSourceChanged(
                    wordsLength,
                    this.options.listIdentifier,
                );
            } else {
                this.messages.wordSourceChangeFailed(
                    this.options.listIdentifier,
                    this.options.lengthRange,
                );
            }
        } else {
            this.messages.noList();
        }
    }

    private switchToList(language: string, list: string): void {
        // First, check if there actually is at least a single word for this list by querying it..
        const listIdent = new ListIdentifier(language, list);
        if (
            undefined !==
            this.listManager.randomWord(listIdent, this.options.lengthRange)
        ) {
            this.options.listIdentifier = listIdent;
            this.options.language = listIdent.language;
            this.storeSettings();
            this.messages.wordSourceChanged(
                this.options.lengthRange,
                listIdent,
            );
        } else {
            this.messages.wordSourceChangeFailed(
                listIdent,
                this.options.lengthRange,
            );
        }
    }

    private async switchUseThreads() {
        this.options.useThreads = !this.options.useThreads;
        this.storeSettings();
        if (this.options.useThreads && this.channel.type === "GUILD_TEXT") {
            const textChannel = this.channel as TextChannel;
            try {
                let gameTitle = "Wordle";
                const user = textChannel.members.get(this.owner);
                if (user && undefined !== user.displayName) {
                    gameTitle += ` (${user.displayName})`;
                }

                const thread = await textChannel.threads.create({
                    name: gameTitle,
                    // this only allows specific values, 60 is the smallest one..
                    // reason we set it: if we do not actually have permissions to archive the thread,
                    // this at least makes it disappear reasonably quickly
                    autoArchiveDuration: 60,
                });
                this.players.forEach(async (player) => {
                    await thread.members.add(player);
                });

                new Game(
                    this.logger.getChildLogger(),
                    this.owner,
                    thread,
                    this.commandParser,
                    this.listManager,
                    this.messages.getRenderer(),
                    this.settingsDb,
                    this.options,
                    this.tracker,
                    this.players,
                );
                await this.messages.spawnedThread(gameTitle);
                this.cleanUp();
            } catch (e) {
                this.logger.warn(
                    "Could not create thread for channel",
                    textChannel.name,
                    ", skipping escalation",
                    e,
                );
                this.messages.couldNotUseThreads();
            }
        } else {
            this.messages.useThreadsChanged(this.options.useThreads);
        }
    }

    private reveal() {
        this.tracker.gameEnded(
            this.options.reportStats,
            "revealed",
            this.options,
        );
        if (undefined !== this.word) {
            this.messages.reveal(this.word, RevealReason.Aborted).then(() => {
                return this.returnToLobby();
            });
        } else {
            this.returnToLobby();
        }
    }

    private storeSettings(): void {
        if (this.originalOwner) {
            this.settingsDb.update(this.owner, this.options);
        }
    }

    private printCurrentListInfo(): void {
        this.messages.listInfo(
            this.listManager,
            this.options.listIdentifier,
            this.options.lengthRange,
        );
    }

    getState(): State {
        return this.state;
    }

    join(player: Snowflake): void {
        if (this.players.indexOf(player) < 0) {
            this.players.push(player);
            this.messages.joined(player);
        }
    }

    async leave(player: Snowflake): Promise<void> {
        const index = this.players.indexOf(player);
        if (-1 !== index) {
            this.players.splice(index, 1);
            if (this.players.length === 0) {
                this.tracker.gameEnded(
                    this.options.reportStats,
                    "left",
                    this.options,
                );
                await this.messages.noPlayersLeft();
                this.cleanUp();
            } else {
                if (this.owner === player) {
                    this.owner = this.players[0];
                    this.messages.ownerChanged(player, this.owner);
                    this.originalOwner = false;
                }

                if (
                    State.Running === this.state &&
                    Mode.Turns === this.options.mode
                ) {
                    if (index === this.playerIndex) {
                        // because we already removed the player,
                        // this.playerIndex is already pointing to the next player
                        this.playerIndex %= this.players.length;
                        this.messages.promptPlayerTurn(
                            this.players[this.playerIndex],
                        );
                        this.restartRoundTimer();
                    } else if (index < this.playerIndex) {
                        // to maintain the current player
                        this.playerIndex--;
                    }
                } else {
                    this.playerIndex %= this.players.length;
                }
            }
        }
    }

    start() {
        if (undefined === this.options.listIdentifier) {
            this.options.listIdentifier =
                this.listManager.getDefaultListForLanguage(
                    this.options.language,
                );
        }
        if (undefined === this.options.listIdentifier) {
            this.logger.error(
                "Could not get default list for language",
                this.options.language,
                "!",
            );
        } else {
            this.word = this.listManager.randomWord(
                this.options.listIdentifier,
                this.options.lengthRange,
            );

            if (undefined !== this.word) {
                this.logger.debug(
                    "New game has started in channel",
                    this.channel.id,
                    ", word to be guessed is",
                    this.word,
                );

                this.state = State.Running;

                if (Mode.Turns === this.options.mode) {
                    this.messages.gameStarted(this.word.word.length, {
                        nextPlayer: this.players[this.playerIndex],
                        guessCount: this.guessCount,
                        maxGuessCount: this.options.maxAttempts,
                    });

                    this.restartRoundTimer();
                } else {
                    this.messages.gameStarted(this.word.word.length, {
                        guessCount: this.guessCount,
                        maxGuessCount: this.options.maxAttempts,
                    });
                }
            } else {
                this.logger.error(
                    "Could not get word with length",
                    this.options.lengthRange,
                    "from list",
                    ListIdentifier.getUserString(this.options.listIdentifier),
                );
            }
        }
    }

    nextGuessExpectedFrom(): Snowflake {
        return this.players[this.playerIndex];
    }

    makeGuess(player: Snowflake, guess: string): void {
        if (undefined !== this.word) {
            if (guess.length !== this.word.word.length) {
                // For now, do nothing here.
            } else if (
                this.options.checkWords &&
                !this.listManager.checkGlobal(this.options.language, guess)
            ) {
                this.messages.unknownWord(guess);
            } else {
                this.guessCount++;
                const result = generateResult(this.word.word, guess);
                if (
                    result.every(
                        (charResult) => Result.Correct === charResult.result,
                    )
                ) {
                    this.tracker.gameEnded(
                        this.options.reportStats,
                        this.guessCount,
                        this.options,
                    );
                    this.messages.guessedCorrectly(result, player).then(() => {
                        this.returnToLobby();
                    });
                } else {
                    if (!this.guessesExhausted()) {
                        if (Mode.Turns === this.options.mode) {
                            this.advancePlayerIndex();
                            if (this.players.length > 1) {
                                this.messages.feedback(player, result, {
                                    nextPlayer: this.players[this.playerIndex],
                                    guessCount: this.guessCount,
                                    maxGuessCount: this.options.maxAttempts,
                                });
                            } else {
                                this.messages.feedback(player, result, {
                                    guessCount: this.guessCount,
                                    maxGuessCount: this.options.maxAttempts,
                                });
                            }
                            this.restartRoundTimer();
                        } else if (Mode.Free === this.options.mode) {
                            this.messages.feedback(player, result, {
                                guessCount: this.guessCount,
                                maxGuessCount: this.options.maxAttempts,
                            });
                        }
                    } else {
                        this.messages
                            .feedback(player, result, {
                                guessCount: this.guessCount,
                                maxGuessCount: this.options.maxAttempts,
                            })
                            .then(() => this.outOfGuesses());
                    }
                }
            }
        }
    }

    private outOfGuesses(): void {
        this.tracker.gameEnded(
            this.options.reportStats,
            "guessesExhausted",
            this.options,
        );
        if (undefined !== this.word) {
            this.messages
                .reveal(this.word, RevealReason.GuessesExhausted)
                .then(() => this.returnToLobby());
        } else {
            this.returnToLobby();
        }
    }

    private guessesExhausted(): boolean {
        return (
            undefined !== this.options.maxAttempts &&
            0 >= this.options.maxAttempts - this.guessCount
        );
    }

    private returnToLobby(): void {
        // this.playerIndex is purposefully not reset.
        if (undefined !== this.turnTimeout) {
            clearTimeout(this.turnTimeout);
            this.turnTimeout = undefined;
        }
        this.guessCount = 0;
        this.word = undefined;
        this.state = State.Setup;

        this.messages.lobbyText(this.owner, this.options);
    }

    private advancePlayerIndex() {
        this.playerIndex = (this.playerIndex + 1) % this.players.length;
    }

    private resetInactivityTimer() {
        clearTimeout(this.inactiveTimeout);

        this.inactiveTimeout = setTimeout(
            () => this.cancelDueToInactivity(),
            MAX_INACTIVE_TIME,
        );
    }

    private async cancelDueToInactivity() {
        if (this.state === State.Running) {
            this.tracker.gameEnded(
                this.options.reportStats,
                "timeout",
                this.options,
            );
        }
        await this.messages.timeout();
        this.cleanUp();
    }

    private restartRoundTimer() {
        if (this.turnTimeout !== undefined) {
            clearTimeout(this.turnTimeout);
        }

        this.turnTimeout = setTimeout(
            () => this.playerTimedOut(),
            this.options.turnTimeout,
        );
    }

    private async cleanUp() {
        clearTimeout(this.inactiveTimeout);
        if (this.turnTimeout !== undefined) {
            clearTimeout(this.turnTimeout);
        }
        this.state = State.Ended;
        this.commandParser.removeAllForChannel(this.channel.id);
        if (this.channel.isThread()) {
            const threadChannel = this.channel as ThreadChannel;
            try {
                (
                    await threadChannel.setName("[ENDED] " + threadChannel.name)
                ).setArchived();
            } catch (e) {
                this.logger.warn("Could not properly close channel", e);
            }
        }
    }

    private playerTimedOut() {
        // in theory, this method should not be triggered while in Mode.Free,
        // but just to make sure
        if (Mode.Turns === this.options.mode) {
            const currentPlayer = this.players[this.playerIndex];
            this.guessCount++;
            if (!this.guessesExhausted()) {
                this.advancePlayerIndex();
                if (this.players.length > 1) {
                    this.messages.turnTimeout(currentPlayer, {
                        nextPlayer: this.players[this.playerIndex],
                        guessCount: this.guessCount,
                        maxGuessCount: this.options.maxAttempts,
                    });
                } else {
                    this.messages.turnTimeout(currentPlayer, {
                        guessCount: this.guessCount,
                        maxGuessCount: this.options.maxAttempts,
                    });
                }
                this.restartRoundTimer();
            } else {
                this.outOfGuesses();
            }
        }
    }
}

export function generateResult(word: string, guess: string): CharResult[] {
    const wordLower = word.toLowerCase();
    const result: CharResult[] = new Array(wordLower.length);
    for (let i = 0; i < wordLower.length; i++) {
        const guessedCharacter = guess.charAt(i);
        if (guessedCharacter === wordLower.charAt(i)) {
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
                wordLower,
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
