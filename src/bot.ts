require("dotenv").config();

import {
    Client,
    Intents,
    Message,
    Snowflake,
    TextChannel,
    MessagePayload,
} from "discord.js";
import { SpecialTurnResponse, Game, CharState, State } from "./interfaces";
import { Basic as Renderer } from "./renderer";
import { Game as GameImpl } from "./game";
import { COMMANDS } from "./commands";

const charStateFeedback: Map<CharState, string> = new Map([
    [CharState.Correct, "！"],
    [CharState.Moved, "？"],
    [CharState.Wrong, ""],
]);

class Bot {
    private client: Client;

    private activeGames = new Map<Snowflake, Game>();
    private renderer = new Renderer();

    constructor(client: Client) {
        this.client = client;
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
                    if (message.content.startsWith(COMMANDS.JOIN)) {
                        if (activeGame.join(userId))
                            this.sendMessage(
                                message.channelId,
                                `Player <@${userId}> joined the lobby!`,
                            );
                    } else if (message.content.startsWith(COMMANDS.START)) {
                        if (activeGame.start(userId)) {
                            this.prompt(
                                activeGame.nextGuessExpectedFrom(),
                                message.channelId,
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
        } else if (message.content.startsWith(COMMANDS.WAKE_UP)) {
            this.activeGames.set(
                message.channelId,
                new GameImpl(
                    userId,
                    message.channelId,
                    (userId: Snowflake, channelId: Snowflake) =>
                        this.timeout(userId, channelId),
                ),
            );
            this.sendMessage(
                message.channelId,
                `Temporary feedback to show the game has been created`,
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
            switch (guessResult) {
                case SpecialTurnResponse.WonGame:
                    this.sendMessage(
                        channelId,
                        `<@${userId}> guessed the word correctly! The word was ${guess}.`,
                    );
                    break;
                case SpecialTurnResponse.WrongPlayer:
                    break;
                case SpecialTurnResponse.BadGuess:
                    this.sendMessage(
                        channelId,
                        `Received a bad guess from <@${userId}>. Guess must be 4 chars long.`,
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

    private timeout(userId: Snowflake, channelId: Snowflake) {
        this.sendMessage(
            channelId,
            `<@${userId}> took too long to guess! Passing the baton...`,
        );

        const activeGame = this.activeGames.get(channelId);
        if (undefined !== activeGame)
            this.prompt(activeGame.nextGuessExpectedFrom(), channelId);
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

let bot = new Bot(client);

bot.start(process.env.DISCORD_TOKEN);
