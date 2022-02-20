import { Client, Intents, Message, Snowflake, TextChannel } from "discord.js";
import { config as readEnv } from "dotenv";
import { Logger } from "tslog";

import { CommandParser } from "./commands";
import { Game } from "./game";
import { State } from "./interfaces";
import { ListManager } from "./list_manager";
import { Basic as Renderer } from "./renderer";
import { SettingsDb } from "./settings_db";

readEnv();

class Bot {
    private readonly client: Client;
    private readonly logger = new Logger();
    private readonly globalSettingsDb = new SettingsDb();

    private readonly activeGames = new Map<Snowflake, Game>();
    private readonly listManager: ListManager = new ListManager();
    private readonly commandParser = new CommandParser();
    private readonly renderer: Renderer;

    constructor(client: Client, font?: string) {
        this.client = client;
        this.renderer = new Renderer(font);
    }

    start(token: string | undefined) {
        this.logger.info("Starting..");
        this.listManager.load();

        this.commandParser.registerGlobalListener(
            /!wordle/,
            (channel: Snowflake, user: Snowflake) => this.wakeUp(channel, user),
        );

        client.once("ready", () => this.ready());
        client.on("messageCreate", (message: Message) =>
            this.messageCreate(message),
        );
        client.login(token);
    }

    private wakeUp(channelId: Snowflake, player: Snowflake): boolean {
        const game = this.activeGames.get(channelId);
        if (undefined === game || State.Ended === game.getState()) {
            const channel = this.resolveChannel(channelId);
            if (undefined !== channel) {
                this.activeGames.set(
                    channelId,
                    new Game(
                        player,
                        channel,
                        this.commandParser,
                        this.listManager,
                        this.renderer,
                        this.globalSettingsDb,
                    ),
                );
                channel.send(
                    `<@${player}> is starting a new game! Type \`!join\` to join, and type \`!start\` to start! For information on which word list is currently being used, try to type \`!list\`.`,
                );
            } else {
                this.logger.error(
                    "Could not find channel for snowflake",
                    channelId,
                    "!",
                );
            }
        }
        return true;
    }

    private ready() {
        if (null !== this.client.user) {
            this.logger.info("Sucessfully logged in as", this.client.user.tag);
            this.commandParser.setThisId(this.client.user.id);
        } else {
            this.logger.error("Error logging in..");
        }
    }
    private messageCreate(message: Message) {
        this.commandParser.messageReceived(message);
    }

    private resolveChannel(id: Snowflake): TextChannel | undefined {
        const channel = this.client.channels.cache.get(id);
        if (undefined !== channel) {
            return channel as TextChannel;
        }
        return undefined;
    }
}

// https://discord.com/developers/docs/topics/gateway#gateway-intents
const client = new Client({
    intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

const bot = new Bot(client, process.env.FONT);

bot.start(process.env.DISCORD_TOKEN);
