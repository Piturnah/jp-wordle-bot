import { Client, Intents, Message, Snowflake, TextChannel } from "discord.js";
import { Logger } from "tslog";

import { debug, font, token } from "../config.json";
import { CommandParser } from "./commands";
import { Game } from "./game";
import { State } from "./interfaces";
import { ListManager } from "./list_manager";
import { Basic as Renderer } from "./renderer";
import { SettingsDb } from "./settings_db";

class Bot {
    private readonly client: Client;
    private readonly logger = new Logger();
    private readonly globalSettingsDb = new SettingsDb();

    private readonly activeGames = new Map<Snowflake, Game>();
    private readonly listManager: ListManager = new ListManager(
        this.logger.getChildLogger(),
    );
    private readonly commandParser = new CommandParser(
        this.logger.getChildLogger(),
    );
    private readonly renderer: Renderer;

    constructor(client: Client, debug = false, font?: string) {
        this.logger.info("Debug mode is ", debug ? "ON" : "OFF", ".");
        if (debug) {
            this.logger.setSettings({ minLevel: "trace" });
        } else {
            this.logger.setSettings({ minLevel: "info" });
        }
        this.client = client;
        this.renderer = new Renderer(font);
    }

    start(token: string) {
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
                        this.logger.getChildLogger(),
                        player,
                        channel,
                        this.commandParser,
                        this.listManager,
                        this.renderer,
                        this.globalSettingsDb,
                    ),
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

const bot = new Bot(client, debug, font ?? undefined);

bot.start(token);
