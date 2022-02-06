import {
    Client,
    Intents,
    Message,
    MessagePayload,
    Snowflake,
    TextChannel,
} from "discord.js";
import { config as readEnv } from "dotenv";

import { Commands } from "./commands";
import { Game as GameImpl } from "./game";
import { CharState, Game, SpecialTurnResponse, State } from "./interfaces";
import { DebugMode, ListManager } from "./list_manager";
import { Basic as Renderer } from "./renderer";
import { WordLists } from "./word_lists";

readEnv();

class Bot {
    private client: Client;

    private activeGames = new Map<Snowflake, Game>();
    private renderer = new Renderer();
    private listManager: ListManager;

    constructor(client: Client) {
        this.client = client;
        this.listManager = new ListManager(new DebugMode());
        for (const language of this.listManager.getLanguages()) {
            const lists = this.listManager.getLists(language);
            console.log(
                `Successfully loaded lists for language ${language}: ${lists.map(
                    (ident) => ident.list,
                )}`,
            );

            lists.forEach((list) => {
                console.log(
                    `Got random word from list: ${list.getUserString()}: ${this.listManager.randomWord(
                        list,
                        4,
                    )}`,
                );
            });
        }
    }

    start(token: string | undefined) {
        client.once("ready", () => this.ready());
        client.on("messageCreate", (message: Message) =>
            this.messageCreate(message),
        );
        client.login(token);
    }

    private ready() {
        if (null !== client.user)
            console.log(
                `${
                    client.user.tag
                } successfully logged in at ${new Date().toTimeString()}`,
            );
    }

    private messageCreate(message: Message) {
        const userId = message.author.id;
        const activeGame = this.activeGames.get(message.channelId);
        if (undefined !== activeGame && userId !== client.user?.id) {
            switch (activeGame.getState()) {
                case State.Setup:
                    if (message.content.startsWith(Commands.Join)) {
                        if (activeGame.join(userId))
                            this.sendMessage(
                                message.channelId,
                                `Player <@${userId}> joined the lobby!`,
                            );
                    } else if (message.content.startsWith(Commands.Start)) {
                        if (activeGame.start(userId)) {
                            this.prompt(
                                activeGame.nextGuessExpectedFrom(),
                                message.channelId,
                            );
                        }
                    } else if (message.content.startsWith(Commands.Leave)) {
                        const result = activeGame.leave(userId);
                        if (typeof result === "boolean" && result) {
                            this.sendMessage(
                                message.channelId,
                                `Game ended as last player left the lobby!`,
                            );
                            this.activeGames.delete(message.channelId);
                        } else {
                            this.sendMessage(
                                message.channelId,
                                `With <@${userId}> leaving the lobby, <@${result}> is now the session owner!`,
                            );
                        }
                    }
                    break;
                case State.Running:
                    this.handleResponse(
                        message.content,
                        activeGame.makeGuess(userId, message.content),
                        userId,
                        message.channelId,
                    );
                    break;
            }
        } else if (message.content.startsWith(Commands.WakeUp)) {
            this.activeGames.set(
                message.channelId,
                new GameImpl(
                    userId,
                    message.channelId,
                    (userId: Snowflake, channelId: Snowflake) =>
                        this.playerTimeout(userId, channelId),
                    (userId: Snowflake, channelId: Snowflake) =>
                        this.lobbyTimeout(userId, channelId),
                ),
            );
            this.sendMessage(
                message.channelId,
                `<@${message.author.id}> is starting a new game! Type !join to join, and type !start to start!`,
            );
        }
    }

    private handleResponse(
        guess: string,
        guessResult: SpecialTurnResponse | CharState[],
        userId: Snowflake,
        channelId: Snowflake,
    ) {
        if (typeof guessResult === "number") {
            const wordInfo = WordLists.fourKana.get(guess);
            switch (guessResult) {
                case SpecialTurnResponse.WonGame:
                    this.sendMessage(
                        channelId,
                        `<@${userId}> guessed the word correctly! The word was ${guess} ${
                            wordInfo!.kanji !== "" ? `(${wordInfo!.kanji})` : ""
                        }.\nMeaning: ${wordInfo!.eng}`,
                    );
                    this.activeGames.delete(channelId); // NOTE: I am not sure if this is garbage collected. There is no way to directly destroy class instance in JS it seems.
                    break;
                case SpecialTurnResponse.WrongPlayer:
                    break;
                case SpecialTurnResponse.BadGuess:
                    this.sendMessage(
                        channelId,
                        `Received a bad guess from <@${userId}>. Guess must be 4 chars long.`,
                    );
                    break;
                case SpecialTurnResponse.NotAWord:
                    this.sendMessage(
                        channelId,
                        `Received word 「${guess}」 not in the database of words.`,
                    );
                    break;
            }
        } else {
            this.feedback(channelId, guess, guessResult as CharState[]);
        }
    }

    private feedback(
        channelId: Snowflake,
        word: string,
        guessResult: CharState[],
    ) {
        const channel = this.client.channels.cache.get(channelId);
        if (undefined !== channel) {
            const textChannel = channel as TextChannel;
            MessagePayload.resolveFile(
                this.renderer.render(word, guessResult),
            ).then((file) =>
                textChannel
                    .send({ files: [file] })
                    .then(() =>
                        this.prompt(
                            this.activeGames
                                .get(channelId)!
                                .nextGuessExpectedFrom(),
                            channelId,
                        ),
                    ),
            );
            return true;
        }
        console.warn(`No channel cached with ID ${channelId}!`);
        return false;
    }

    private playerTimeout(userId: Snowflake, channelId: Snowflake) {
        this.sendMessage(
            channelId,
            `<@${userId}> took too long to guess! Passing the baton...`,
        );

        const activeGame = this.activeGames.get(channelId);
        if (undefined !== activeGame)
            this.prompt(activeGame.nextGuessExpectedFrom(), channelId);
    }

    private lobbyTimeout(userId: Snowflake, channelId: Snowflake) {
        this.sendMessage(
            channelId,
            `No activity in lobby in the alloted time. Shutting it down.\n(INFO: lobby created by <@${userId}>)`,
        );
        this.activeGames.delete(channelId);
    }

    private prompt(userId: Snowflake, channelId: Snowflake) {
        this.sendMessage(channelId, `<@${userId}>: It is your turn.`);
    }

    private sendMessage(channelId: Snowflake, message: string): boolean {
        const channel = this.client.channels.cache.get(channelId);
        if (undefined !== channel) {
            const textChannel = channel as TextChannel;
            textChannel.send(message);
            return true;
        }
        console.warn(`No channel cached with ID ${channelId}!`);
        return false;
    }
}

// https://discord.com/developers/docs/topics/gateway#gateway-intents
const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

const bot = new Bot(client);

bot.start(process.env.DISCORD_TOKEN);
