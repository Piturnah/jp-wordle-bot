import {
    codeBlock,
    inlineCode,
    underscore,
    userMention,
} from "@discordjs/builders";
import {
    ColorResolvable,
    EmbedFooterData,
    Message,
    MessageAttachment,
    MessageEmbed,
    Snowflake,
    TextBasedChannel,
} from "discord.js";

import { version } from "../package.json";
import { Mode, Options, generateResult } from "./game";
import { CharResult, Result } from "./interfaces";
import {
    LengthRange,
    ListIdentifier,
    ListManager,
    WordWithDetails,
} from "./list_manager";
import { Basic as Renderer } from "./renderer";

export class EmbedColors {
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
export enum RevealReason {
    Aborted,
    GuessesExhausted,
}

export interface FeedbackExtras {
    guessCount: number;
    maxGuessCount?: number;
    nextPlayer?: Snowflake;
}

export enum MessageType {
    normal,
    warning,
    success,
}
export class Messages {
    private static readonly colors = new EmbedColors();

    private readonly renderer: Renderer;
    private readonly channel: TextBasedChannel;
    private readonly logo: MessageAttachment;

    constructor(renderer: Renderer, channel: TextBasedChannel) {
        this.renderer = renderer;
        this.channel = channel;
        this.logo = this.generateLogo();
    }

    maxGuessesChanged(guesses?: number): Promise<Message> {
        return this.sendMessage(
            MessageType.normal,
            "Guesses",
            undefined !== guesses
                ? `Now allowing up to ${inlineCode(
                      "" + guesses,
                  )} guesses before revealing the word.`
                : `Now allowing an unlimited number of guesses.`,
        );
    }
    noList(): Promise<Message> {
        return this.sendMessage(
            MessageType.warning,
            "No list",
            "Currently, no list is selected. Consider seleting a list first.",
        );
    }

    modeChanged(mode: Mode): Promise<Message> {
        const message = `Game has been switched to ${inlineCode(
            mode,
        )} mode. ${this.modeExplanation(mode)}`;
        return this.sendMessage(MessageType.normal, "Mode", message);
    }

    private modeExplanation(mode: Mode) {
        switch (mode) {
            case Mode.Turns:
                return `Players will have to ${inlineCode(
                    "!join",
                )} to participate. The game itself takes place in turns, and the bot will indicate who's turn it is. There is a time limit on each player's turn.`;
            case Mode.Free:
                return `Any present user may guess the word, regardless of if they ${inlineCode(
                    "!join",
                )}ed during lobby stage or not. There are no turns and no turn timer.`;
            default:
                return "";
        }
    }

    wordSourceChanged(
        wordsLength: LengthRange,
        listIdentifier: ListIdentifier,
    ): Promise<Message> {
        return this.sendMessage(
            MessageType.success,
            "Changed",
            `Now using words with ${inlineCode(
                wordsLength.toString(),
            )} characters from ${inlineCode(listIdentifier.getUserString())}.`,
        );
    }

    useThreadsChanged(newValue: boolean): Promise<Message> {
        return this.sendMessage(
            MessageType.success,
            "Changed",
            `Using threads setting set to \`${newValue}\`.`,
        );
    }

    reveal(word: WordWithDetails, reason: RevealReason): Promise<Message> {
        const wordOrAlternative =
            undefined !== word.details &&
            undefined !== word.details.alternateSpelling
                ? word.details.alternateSpelling
                : word.word;
        switch (reason) {
            case RevealReason.Aborted:
                return this.feedbackInternal(
                    generateResult(word.word, word.word),
                    `The round has been aborted early. The correct word was ${underscore(
                        wordOrAlternative,
                    )}.`,
                );
            case RevealReason.GuessesExhausted:
                return this.feedbackInternal(
                    generateResult(word.word, word.word),
                    `Out of guesses! The correct word was ${underscore(
                        wordOrAlternative,
                    )}.`,
                );
        }
    }

    guessedCorrectly(
        result: CharResult[],
        player: Snowflake,
    ): Promise<Message> {
        return this.feedbackInternal(
            result,
            `Wow, ${userMention(
                player,
            )} got it right! Dropping you back to the lobby..`,
        );
    }

    wordSourceChangeFailed(
        listIdent: ListIdentifier,
        wordsLength: LengthRange,
    ) {
        this.sendMessage(
            MessageType.warning,
            "Not found / not applicable",
            `Sorry, either ${inlineCode(
                listIdent.getUserString(),
            )} is not a registered list or it has no words with ${inlineCode(
                wordsLength.toString(),
            )} characters.`,
        );
    }

    listInfo(
        listManager: ListManager,
        listIdentifier: ListIdentifier | undefined,
        wordsLength: LengthRange,
    ) {
        const message =
            undefined === listIdentifier
                ? "Currently, no specific list is selected."
                : `Currently, words with ${inlineCode(
                      wordsLength.toString(),
                  )} characters are chosen at random from ${inlineCode(
                      listIdentifier.getUserString(),
                  )}.`;

        this.sendEmbed(
            new MessageEmbed()
                .setColor(Messages.colors.normal)
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
                .addField("Lists", Messages.listsToString(listManager), true)
                .setFooter({
                    text: "Want to see other languages and/or lists? Feel free to reach out and we can work together to provide more lists. See the bot's description for details.",
                }),
        );
    }

    private static listsToString(listManager: ListManager): string {
        let message = "";
        listManager.getLanguages().forEach((language) => {
            message += `\n${language}/`;
            listManager.getListsWithDetails(language).forEach((details) => {
                message += `\n\t${details.list.list} (${Array.from(
                    details.listStats.wordsPerLength.values(),
                ).reduce((sum, number) => sum + number)} words)`;
            });
        });
        return codeBlock(message);
    }

    promptPlayerTurn(player: Snowflake) {
        this.sendMessage(
            MessageType.normal,
            "Turn",
            `${userMention(player)}, it's now your turn.`,
        );
    }

    gameStarted(length: number, extras: FeedbackExtras) {
        const emptyArray = new Array(length).fill({
            character: " ",
            result: Result.Wrong,
        });

        if (undefined !== extras.nextPlayer) {
            this.feedbackInternal(
                emptyArray,
                `Can you guess the word? ${userMention(
                    extras.nextPlayer,
                )} will be the first to guess.`,
                this.createAttemptsLeftFooter(
                    extras.guessCount,
                    extras.maxGuessCount,
                ),
            );
        } else {
            this.feedbackInternal(
                emptyArray,
                `Can someone guess the word?`,
                this.createAttemptsLeftFooter(
                    extras.guessCount,
                    extras.maxGuessCount,
                ),
            );
        }
    }

    ownerChanged(previousOwner: Snowflake, newOwner: Snowflake) {
        this.sendMessage(
            MessageType.normal,
            "Owner",
            `With ${userMention(
                previousOwner,
            )} leaving the lobby, ${userMention(
                newOwner,
            )} is now the session owner!`,
        );
    }

    noPlayersLeft(): Promise<Message> {
        return this.sendMessage(
            MessageType.warning,
            "Ended",
            `Game ended as the last player left the session!`,
        );
    }

    turnTimeout(
        previousPlayer: Snowflake,
        extras: FeedbackExtras,
    ): Promise<Message> {
        if (undefined !== extras.nextPlayer) {
            return this.sendEmbed(
                this.createBasicMessage(
                    MessageType.warning,
                    "Timeout",
                    `${userMention(
                        previousPlayer,
                    )} took too long to answer! ${userMention(
                        extras.nextPlayer,
                    )} is up next.`,
                ).setFooter(
                    this.createAttemptsLeftFooter(
                        extras.guessCount,
                        extras.maxGuessCount,
                    ),
                ),
            );
        } else {
            return this.sendEmbed(
                this.createBasicMessage(
                    MessageType.warning,
                    "Timeout",
                    `${userMention(
                        previousPlayer,
                    )}, you took too long to answer and lost an attempt!`,
                ).setFooter(
                    this.createAttemptsLeftFooter(
                        extras.guessCount,
                        extras.maxGuessCount,
                    ),
                ),
            );
        }
    }

    timeout() {
        this.sendMessage(
            MessageType.warning,
            "Timeout",
            `Session has been cancelled due to inactivity. You may start a new session at any time by invoking ${inlineCode(
                "!wordle",
            )}.`,
        );
    }

    unknownWord(guess: string) {
        this.sendMessage(
            MessageType.warning,
            "Unknown",
            `Hmmm... I do not know "${guess}". Please try another word..`,
        );
    }

    joined(player: Snowflake): Promise<Message> {
        return this.sendMessage(
            MessageType.normal,
            "Joined",
            `${userMention(player)} has joined the game.`,
        );
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
            .setColor(Messages.colors.resolve(type))
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

    private feedbackInternal(
        result: CharResult[],
        text: string,
        footer?: EmbedFooterData,
    ): Promise<Message> {
        const attachment = this.renderer.render(result, "result.png");
        const embed = new MessageEmbed()
            .setColor(Messages.colors.normal)
            .setAuthor({ name: "Wordle" })
            .setDescription(text)
            .setImage("attachment://result.png");
        if (undefined !== footer) {
            embed.setFooter(footer);
        }

        return this.sendEmbed(embed, attachment);
    }

    feedback(
        player: Snowflake,
        result: CharResult[],
        extras?: FeedbackExtras,
    ): Promise<Message> {
        let text = `Not quite, ${userMention(player)}. `;
        if (undefined !== extras && undefined !== extras.nextPlayer) {
            text += `${userMention(
                extras.nextPlayer,
            )} will be the next to guess.`;
        } else {
            text += `Feel free to try again.`;
        }

        if (undefined !== extras) {
            return this.feedbackInternal(
                result,
                text,
                this.createAttemptsLeftFooter(
                    extras.guessCount,
                    extras.maxGuessCount,
                ),
            );
        } else {
            return this.feedbackInternal(result, text);
        }
    }

    lobbyText(owner: Snowflake, options: Options): Promise<Message> {
        return this.sendEmbed(
            new MessageEmbed()
                .setColor(Messages.colors.normal)
                .setTitle("Lobby")
                .setDescription(
                    `Welcome to Wordle. This session is currently owned by ${userMention(
                        owner,
                    )}, who may ${inlineCode("!start")} the game at any time.`,
                )
                .addField(
                    "Mode",
                    `The game is in ${inlineCode(
                        options.mode,
                    )} mode right now. ${this.modeExplanation(
                        options.mode,
                    )}\nThe owner may switch modes using ${inlineCode(
                        "!mode <mode>",
                    )}, where ${inlineCode(
                        "<mode>",
                    )} is one of either ${inlineCode("turns")} or ${inlineCode(
                        "free",
                    )}.`,
                )
                .addField(
                    "Joining",
                    `Players may ${inlineCode(
                        "!join",
                    )} while in lobby mode. This is not relevant in ${inlineCode(
                        Mode.Free,
                    )} mode.`,
                )
                .addField(
                    "Leaving",
                    `Players may ${inlineCode("!leave")} at any time.`,
                )
                .addField(
                    "Words",
                    `The bot uses different word lists to generate random words for you to play with.${
                        options.listIdentifier
                            ? ` Currently, words with ${inlineCode(
                                  options.lengthRange.toString(),
                              )} characters from list ${inlineCode(
                                  options.listIdentifier.getUserString(),
                              )} are being used.`
                            : " Currently, no list is selected."
                    } Type ${inlineCode("!list")} to find out more.`,
                )
                .addField(
                    "Guesses",
                    `Currently, players are allowed to make ${
                        undefined !== options.maxAttempts
                            ? `at most ${inlineCode("" + options.maxAttempts)}`
                            : "arbitrarily many"
                    } guesses. The owner may set a specific number of guesses with ${inlineCode(
                        "!guesses <number>",
                    )} or allow unlimited guesses with ${inlineCode(
                        "!guesses unlimited",
                    )}.`,
                )
                .addField(
                    "Threads",
                    `Currently, new sessions will be created ${
                        options.useThreads
                            ? "in a new, dedicated thread"
                            : "in the current channel"
                    }. This behaviour can be toggled with the command ${inlineCode(
                        "!threads",
                    )}.`,
                )
                .setFooter({
                    text: `We are happy to hear your thoughts and feedback. Please refer to the bot's profile to learn more. Version: ${version}.`,
                }),
        );
    }

    private createAttemptsLeftFooter(
        guessCount: number,
        maxAttempts?: number,
    ): EmbedFooterData {
        if (undefined !== maxAttempts) {
            return {
                text: `${
                    maxAttempts - guessCount
                } guesses left. You may ${inlineCode(
                    "!leave",
                )} at any time. The owner can also ${inlineCode(
                    "!reveal",
                )} the word early and return to the lobby.`,
            };
        } else {
            return {
                text: `${guessCount} guesses made so far. You may ${inlineCode(
                    "!leave",
                )} at any time. The owner can also ${inlineCode(
                    "!reveal",
                )} the word early and return to the lobby.`,
            };
        }
    }
}
