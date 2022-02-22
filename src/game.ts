import {
    codeBlock,
    inlineCode,
    italic,
    userMention,
} from "@discordjs/builders";
import {
    ColorResolvable,
    EmbedFooterData,
    Message,
    MessageAttachment,
    MessageEmbed,
    Snowflake,
    TextChannel,
} from "discord.js";
import { Logger } from "tslog";

import { version } from "../package.json";
import { CommandParser } from "./commands";
import { CharResult, Result, State } from "./interfaces";
import {
    ListIdentifier,
    ListManager,
    WordWithDetails,
    WordsLength,
} from "./list_manager";
import { Basic as Renderer } from "./renderer";
import { SettingsDb } from "./settings_db";

export class Options {
    checkWords = false;
    turnTimeout = 25000;
    maxTurnTimeouts = 3;
    lobbyTimeout = 60000;
    multiRound = false;
    maxAttempts = 12;
    language = "en";
    listIdentifier?: ListIdentifier;
    wordsLength: WordsLength = new WordsLength(4, 6);
}

class EmbedColors {
    normal: ColorResolvable = "#520711";
    game: ColorResolvable = "#FFFFFF";
    warning: ColorResolvable = "#d6d600";
    success: ColorResolvable = "#05eb42";

    resolve(type: MessageType): ColorResolvable {
        switch (type) {
            case MessageType.warning:
                return this.warning;
            case MessageType.success:
                return this.success;
            case MessageType.normal:
            default:
                return this.normal;
        }
    }
}

enum MessageType {
    normal,
    warning,
    success,
}

enum TimerUsecase {
    Turn,
    Lobby,
}

export class Game {
    private static readonly colors = new EmbedColors();

    private readonly settingsDb: SettingsDb;
    private readonly listManager: ListManager;
    private readonly channel: TextChannel;
    private readonly commandParser: CommandParser;
    private readonly renderer;
    private readonly logger: Logger;
    private readonly logo: MessageAttachment;

    private options = new Options();
    private originalOwner = true;
    private state: State;
    private guessCount = 0;

    private players: Snowflake[];
    private owner: Snowflake;
    private playerIndex = 0;
    private currentTimeout: undefined | ReturnType<typeof setTimeout> =
        undefined;

    private registeredTimeouts = 0;

    private word?: WordWithDetails = undefined;

    constructor(
        logger: Logger,
        player: Snowflake,
        channel: TextChannel,
        commandParser: CommandParser,
        listManager: ListManager,
        renderer: Renderer,
        settingsDb: SettingsDb,
    ) {
        this.logger = logger;
        this.state = State.Setup;
        this.channel = channel;
        this.commandParser = commandParser;
        this.owner = player;
        this.players = [this.owner];

        this.settingsDb = settingsDb;
        let loadedSettings = this.settingsDb.load(player);
        if (undefined === loadedSettings) {
            loadedSettings = new Options();
            this.settingsDb.store(player, loadedSettings);
        }
        this.options = loadedSettings;

        this.listManager = listManager;
        if (undefined === this.options.listIdentifier) {
            this.options.listIdentifier =
                this.listManager.getDefaultListForLanguage(
                    this.options.language,
                );
        }

        this.renderer = renderer;

        this.logo = this.generateLogo();

        this.setupListeners(commandParser);

        this.sendEmbed(this.lobbyText());

        this.startTimer(TimerUsecase.Lobby);
    }

    private generateLogo(): MessageAttachment {
        const array: CharResult[] = [];

        const wordle = "wordle";
        for (let i = 0; i < wordle.length; ++i) {
            const value = Math.floor(Math.random() * 3);
            switch (value) {
                case 0:
                    array.push({
                        character: wordle.charAt(i),
                        result: Result.Correct,
                    });
                    break;
                case 1:
                    array.push({
                        character: wordle.charAt(i),
                        result: Result.Moved,
                    });
                    break;
                case 2:
                default:
                    array.push({
                        character: wordle.charAt(i),
                        result: Result.Wrong,
                    });
                    break;
            }
        }

        return this.renderer.render(array, "logo.jpg");
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
            /!abort/,
            (_channel, player) => {
                this.abort(player);
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
                return State.Running === this.state;
            },
        );

        commandParser.registerChannelListener(this.channel.id, /!list/, () => {
            this.printCurrentListInfo();
            return State.Setup === this.state;
        });

        commandParser.registerChannelListener(
            this.channel.id,
            /!list (?<language>\w+)\/(?<list>\w+)/,
            (_channel, player, input) => {
                this.switchToList(player, input[0], input[1]);
                return State.Setup === this.state;
            },
        );
        commandParser.registerChannelListener(
            this.channel.id,
            /!length (?<min>[1-9]\d*)( (?<max>[1-9]\d*))?/,
            (_channel, player, input) => {
                this.setWordLength(
                    player,
                    parseInt(input[0]),
                    parseInt(
                        undefined !== input[1] ? input[1].trim() : input[0],
                    ),
                );
                return State.Setup === this.state;
            },
        );
    }

    private setWordLength(player: Snowflake, min: number, max: number) {
        if (State.Setup === this.state && player === this.owner) {
            this.startTimer(TimerUsecase.Lobby);
            if (undefined !== this.options.listIdentifier) {
                if (min > max) {
                    // fancy trick to swap the values without temporary
                    max = [min, (min = max)][0];
                }
                const wordsLength = new WordsLength(min, max);
                if (
                    undefined !==
                    this.listManager.randomWord(
                        this.options.listIdentifier,
                        wordsLength,
                    )
                ) {
                    this.options.wordsLength = wordsLength;
                    this.storeSettings();
                    this.sendMessage(
                        MessageType.success,
                        "Changed",
                        `Now using words with ${wordsLength.pretty()} from ${inlineCode(
                            this.options.listIdentifier.getUserString(),
                        )}.`,
                    );
                } else {
                    this.sendMessage(
                        MessageType.warning,
                        "No words",
                        `There are no words with ${wordsLength.pretty()} in ${inlineCode(
                            this.options.listIdentifier.getUserString(),
                        )}. Consider switching to another list or specifying a different length.`,
                    );
                }
            } else {
                this.sendMessage(
                    MessageType.warning,
                    "No list",
                    "Currently, no list is selected. Consider seleting a list first.",
                );
            }
        }
    }

    private switchToList(
        player: Snowflake,
        language: string,
        list: string,
    ): void {
        if (State.Setup === this.state && this.owner === player) {
            this.startTimer(TimerUsecase.Lobby);
            // First, check if there actually is at least a single word for this list by querying it..
            const listIdent = new ListIdentifier(language, list);
            if (
                undefined !==
                this.listManager.randomWord(listIdent, this.options.wordsLength)
            ) {
                this.options.listIdentifier = listIdent;
                this.options.language = listIdent.language;
                this.storeSettings();
                this.sendMessage(
                    MessageType.success,
                    "Switched",
                    `Sucessfully switched to list ${inlineCode(
                        listIdent.getUserString(),
                    )}.`,
                );
            } else {
                this.sendMessage(
                    MessageType.warning,
                    "Not found / not applicable",
                    `Sorry, either ${inlineCode(
                        listIdent.getUserString(),
                    )} is not a registered list or it has no suitable words.`,
                );
            }
        }
    }

    private abort(player: Snowflake) {
        if (State.Running === this.state && this.owner === player) {
            if (undefined !== this.word) {
                this.feedback(
                    Game.generateResult(this.word.word, this.word.word),
                    `${userMention(
                        player,
                    )} has aborted the round early! This would have bee the correct word. Dropping you back into the lobby..`,
                    false,
                ).then(() => {
                    return this.dropBackToLobby();
                });
            } else {
                this.dropBackToLobby();
            }
        }
    }

    private storeSettings(): void {
        if (this.originalOwner) {
            this.settingsDb.store(this.owner, this.options);
        }
    }

    private printCurrentListInfo(): void {
        if (State.Setup === this.state) {
            const message =
                undefined === this.options.listIdentifier
                    ? "Currently, no specific list is selected."
                    : `Currently, words with ${this.options.wordsLength.pretty()} are chosen at random from ${inlineCode(
                          this.options.listIdentifier.getUserString(),
                      )}.`;

            this.sendEmbed(
                new MessageEmbed()
                    .setColor(Game.colors.normal)
                    .setTitle("Words")
                    .setDescription(message)
                    .addField(
                        "Changing lists",
                        `Use ${inlineCode(
                            "!list <language>/<list>",
                        )} to switch to another list.`,
                    )
                    .addField(
                        "Changing character count",
                        `Use ${inlineCode(
                            "!length <length>",
                        )} to set a specific word length.\nUse ${inlineCode(
                            "!length <min> <max>",
                        )} to set a range of word lengths.`,
                    )
                    .addField("Lists", this.listInfo(), true)
                    .setFooter({
                        text: "Want to see other languages and/or lists? Feel free to reach out and we can work together to provide more lists. See the bot's description for details.",
                    }),
            );
            this.startTimer(TimerUsecase.Lobby);
        }
    }

    private listInfo(): string {
        let message = "";
        this.listManager.getLanguages().forEach((language) => {
            message += `\n${language}/`;
            this.listManager
                .getListsWithDetails(language)
                .forEach((details) => {
                    message += `\n\t${details.list.list} (${Array.from(
                        details.listStats.wordsPerLength.values(),
                    ).reduce((sum, number) => sum + number)} words)`;
                });
        });
        return codeBlock(message);
    }

    getState(): State {
        return this.state;
    }

    join(player: Snowflake): void {
        if (State.Setup === this.state) {
            if (this.players.indexOf(player) < 0) {
                this.players.push(player);
                this.sendMessage(
                    MessageType.normal,
                    "Joined",
                    `${userMention(player)} has joined the game.`,
                );
                this.startTimer(TimerUsecase.Lobby);
            }
        }
    }

    private sendMessage(
        type: MessageType,
        title: string,
        message: string,
    ): Promise<Message> {
        return this.sendEmbed(this.createBasicMessage(type, title, message));
    }

    private createBasicMessage(
        type: MessageType,
        title: string,
        message: string,
    ): MessageEmbed {
        return new MessageEmbed()
            .setColor(Game.colors.resolve(type))
            .setTitle(title)
            .setDescription(message);
    }

    private sendEmbed(
        embed: MessageEmbed,
        attachment?: MessageAttachment,
    ): Promise<Message> {
        embed.setThumbnail("attachment://logo.jpg");
        return this.channel.send({
            embeds: [embed],
            files:
                undefined !== attachment
                    ? [this.logo, attachment]
                    : [this.logo],
        });
    }

    leave(player: Snowflake): void {
        const index = this.players.indexOf(player);
        if (-1 !== index) {
            this.players.splice(index, 1);
            if (this.players.length === 0) {
                this.sendMessage(
                    MessageType.warning,
                    "Ended",
                    `Game ended as the last player left the session!`,
                );
                this.cleanUp();
            } else {
                if (this.owner === player) {
                    this.owner = this.players[0];
                    this.sendMessage(
                        MessageType.normal,
                        "Owner",
                        `With <@${player}> leaving the lobby, <@${this.owner}> is now the session owner!`,
                    );
                    this.originalOwner = false;
                }

                if (State.Running === this.state) {
                    if (index === this.playerIndex) {
                        // because we already removed the player,
                        // this.playerIndex is already pointing to the next player
                        this.playerIndex %= this.players.length;
                        this.sendMessage(
                            MessageType.normal,
                            "Turn",
                            `<@${
                                this.players[this.playerIndex]
                            }>, it's now your turn.`,
                        );
                        this.startTimer(TimerUsecase.Turn);
                    } else if (index < this.playerIndex) {
                        // to maintain the current player
                        this.playerIndex--;
                    }
                } else {
                    this.playerIndex %= this.players.length;
                    this.startTimer(TimerUsecase.Lobby);
                }
            }
        }
    }

    start(player: Snowflake) {
        if (State.Setup === this.state) {
            if (player === this.owner) {
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
                        this.options.wordsLength,
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

                        const emptyArray = new Array(
                            this.word.word.length,
                        ).fill({
                            character: " ",
                            result: Result.Wrong,
                        });

                        this.feedback(
                            emptyArray,
                            `Can you guess the word? ${userMention(
                                this.players[this.playerIndex],
                            )} will be the first to guess.`,
                        );
                    } else {
                        this.logger.error(
                            "Could not get word with length",
                            this.options.wordsLength,
                            "from list",
                            this.options.listIdentifier.getUserString(),
                        );
                    }
                }
            }
        }
    }

    private lobbyText(): MessageEmbed {
        return new MessageEmbed()
            .setColor(Game.colors.normal)
            .setTitle("Lobby")
            .setDescription(
                `Welcome to Wordle. This session is currently owned by ${userMention(
                    this.owner,
                )}.`,
            )
            .addField(
                "Starting",
                `The owner (${userMention(this.owner)}) may ${inlineCode(
                    "!start",
                )} the game at any time.`,
            )
            .addField(
                "Joining",
                `Players may ${inlineCode("!join")} while in lobby mode.`,
            )
            .addField(
                "Leaving",
                `Players may ${inlineCode("!leave")} at any time, ${italic(
                    "even while a game is ongoing",
                )}.`,
            )
            .addField(
                "Words",
                `The bot uses different word lists to generate random words for you to play with.${
                    this.options.listIdentifier
                        ? ` Currently, words with ${this.options.wordsLength.pretty()} from list ${inlineCode(
                              this.options.listIdentifier.getUserString(),
                          )} are being used.`
                        : " Currently, no list is selected."
                } Type ${inlineCode("!list")} to find out more.`,
            )
            .setFooter({
                text: `We are happy to hear your thoughts and feedback. Please refer to the bot's profile to learn more. Version: ${version}.`,
            });
    }

    private feedback(
        result: CharResult[],
        customText: string,
        withAttemptsLeft = true,
    ): Promise<Message> {
        const attachment = this.renderer.render(result, "result.png");
        const embed = new MessageEmbed()
            .setColor(Game.colors.normal)
            .setAuthor({ name: "Wordle" })
            .setDescription(customText)
            .setImage("attachment://result.png");
        if (withAttemptsLeft) {
            embed.setFooter(this.createAttemptsLeftFooter());
        }

        return this.sendEmbed(embed, attachment);
    }

    private createAttemptsLeftFooter(): EmbedFooterData {
        return {
            text: `${
                this.options.maxAttempts - this.guessCount
            } attempts left. You may ${inlineCode(
                "!leave",
            )} at any time. The owner can also ${inlineCode(
                "!abort",
            )} the round early and return to the lobby.`,
        };
    }

    nextGuessExpectedFrom(): Snowflake {
        return this.players[this.playerIndex];
    }

    makeGuess(player: Snowflake, guess: string): void {
        if (undefined !== this.word) {
            if (player !== this.players[this.playerIndex]) {
                // For now, do nothing here.
            } else if (guess.length !== this.word.word.length) {
                // For now, do nothing here.
            } else if (
                this.options.checkWords &&
                !this.listManager.checkGlobal(this.options.language, guess)
            ) {
                this.sendMessage(
                    MessageType.warning,
                    "Unknown",
                    `Hmmm... I do not know "${guess}". Please try another word..`,
                );
            } else {
                this.registeredTimeouts = 0;
                this.guessCount++;
                const result = Game.generateResult(this.word.word, guess);
                if (
                    result.every(
                        (charResult) => Result.Correct === charResult.result,
                    )
                ) {
                    this.feedback(
                        result,
                        `Wow, ${userMention(
                            player,
                        )} got it right! Dropping you back to the lobby..`,
                        false,
                    ).then(() => {
                        this.dropBackToLobby();
                    });
                } else {
                    if (!this.guessesExhausted()) {
                        this.updatePlayerIndex();
                        if (this.players.length > 1) {
                            this.feedback(
                                result,
                                `Close, ${userMention(player)}! ${userMention(
                                    this.players[this.playerIndex],
                                )} is up next!`,
                            );
                        } else {
                            this.feedback(
                                result,
                                `Not quite! Try again, ${userMention(player)}!`,
                            );
                        }
                    } else {
                        this.feedback(result, `Close, <@${player}>!`).then(
                            () => {
                                this.outOfGuesses();
                            },
                        );
                    }
                }
            }
        }
    }

    private outOfGuesses(): void {
        if (undefined !== this.word) {
            this.feedback(
                Game.generateResult(this.word.word, this.word.word),
                `Out of guesses! This was the correct word. Dropping you back into the lobby.`,
                false,
            ).then(() => {
                return this.dropBackToLobby();
            });
        } else {
            this.dropBackToLobby();
        }
    }

    private guessesExhausted(): boolean {
        return 0 >= this.options.maxAttempts - this.guessCount;
    }

    private dropBackToLobby(): void {
        // this.playerIndex is purposefully not reset.
        this.guessCount = 0;
        this.word = undefined;
        this.state = State.Setup;

        this.sendEmbed(this.lobbyText());

        this.startTimer(TimerUsecase.Lobby);
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
        this.sendMessage(
            MessageType.warning,
            "Timeout",
            `Game has been cancelled due to inactivity. You may start a new session at any time by invoking ${inlineCode(
                "!wordle",
            )}.`,
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

    private allowedTimeouts(): number {
        return Math.max(this.players.length, this.options.maxTurnTimeouts);
    }

    private playerTimedOut() {
        if (++this.registeredTimeouts <= this.allowedTimeouts()) {
            const currentPlayer = this.players[this.playerIndex];
            this.guessCount++;
            if (!this.guessesExhausted()) {
                this.updatePlayerIndex();
                if (this.players.length > 1) {
                    this.sendEmbed(
                        this.createBasicMessage(
                            MessageType.warning,
                            "Timeout",
                            `${userMention(
                                currentPlayer,
                            )} took too long to answer! ${userMention(
                                this.players[this.playerIndex],
                            )} is up next.`,
                        ).setFooter(this.createAttemptsLeftFooter()),
                    );
                } else {
                    this.sendEmbed(
                        this.createBasicMessage(
                            MessageType.warning,
                            "Timeout",
                            `${userMention(
                                currentPlayer,
                            )}, you took too long to answer and lost an attempt!`,
                        ).setFooter(this.createAttemptsLeftFooter()),
                    );
                }
            } else {
                this.outOfGuesses();
            }
        } else if (undefined !== this.word) {
            this.feedback(
                Game.generateResult(this.word.word, this.word.word),
                `Too many consecutive timeouts. You will be returned to the lobby. This would have been the correct word:`,
                false,
            ).then(() => {
                this.dropBackToLobby();
            });
        }
    }
}
