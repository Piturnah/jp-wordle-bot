import {
    Client,
    Intents,
    Message,
    Snowflake,
    TextBasedChannel,
} from "discord.js";
import { Logger } from "tslog";

import { debug, font, token } from "../config.json";
import { CommandParser } from "./commands";
import { Session } from "./game/Session";
import { ListManager } from "./list_manager";
import { Basic as Renderer } from "./renderer";
import { SettingsDb } from "./settings_db";

class Bot {
    private readonly client: Client;
    private readonly logger = new Logger();
    private readonly globalSettingsDb = new SettingsDb();

    private readonly activeGames = new Map<Snowflake, Session>();
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

        this.commandParser.register({
            regEx: /!wordle/,
            listener: (user, _input, channel) => this.wakeUp(channel, user),
        });

        client.once("ready", () => this.ready());
        client.on("messageCreate", (message: Message) =>
            this.messageCreate(message),
        );

        client.login(token);
    }

    private wakeUp(channel: TextBasedChannel, player: Snowflake): boolean {
        const game = this.activeGames.get(channel.id);
        if (undefined === game || "ended" === game.getState()) {
            this.activeGames.set(
                channel.id,
                new Session(
                    this.logger.getChildLogger(),
                    player,
                    channel,
                    this.commandParser,
                    this.listManager,
                    this.renderer,
                    this.globalSettingsDb,
                ),
            );

            return true;
        } else {
            return false;
        }
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
}

// https://discord.com/developers/docs/topics/gateway#gateway-intents
const client = new Client({
    intents: [
        Intents.FLAGS.GUILDS,
        Intents.FLAGS.GUILD_MESSAGES,
        Intents.FLAGS.DIRECT_MESSAGES,
    ],
    // required to receive direct messages, see https://github.com/discordjs/discord.js/issues/5516
    partials: ["CHANNEL"],
});

const bot = new Bot(client, debug, font ?? undefined);

bot.start(token);
