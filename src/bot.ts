import {
    Client,
    Intents,
    Message,
    Snowflake,
    TextBasedChannel,
    TextChannel,
} from "discord.js";
import { Logger } from "tslog";

import { debug, font, statsChannel, token } from "../config.json";
import { CommandParser } from "./commands";
import { Game, Options } from "./game";
import { State } from "./interfaces";
import { ListManager } from "./list_manager";
import { Basic as Renderer } from "./renderer";
import { SettingsDb } from "./settings_db";
import { StatsTracker } from "./stats_tracker";

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

    private statusUpdateTimer?: ReturnType<typeof setTimeout> = undefined;
    private statsTracker: StatsTracker = new StatsTracker(
        this.logger.getChildLogger(),
    );

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

        this.commandParser.registerGlobalListener(/!wordle/, (channel, user) =>
            this.wakeUp(channel, user),
        );

        client.once("ready", () => this.ready());
        client.on("messageCreate", (message: Message) =>
            this.messageCreate(message),
        );

        client.login(token).then(() => this.updateStatus());
    }

    private updateStatus() {
        if (client.user) {
            this.logger.info(
                "Currently active in",
                client.guilds.cache.size,
                "servers",
            );
            client.user.setActivity(
                `!wordle in ${client.guilds.cache.size} servers.`,
            );
        }

        if (undefined != this.statusUpdateTimer) {
            clearTimeout(this.statusUpdateTimer);
        }

        this.statusUpdateTimer = setTimeout(() => this.updateStatus(), 3600000);
    }

    private async wakeUp(
        channel: TextBasedChannel,
        player: Snowflake,
    ): Promise<boolean> {
        let loadedOptions = this.globalSettingsDb.load(player);
        if (undefined === loadedOptions) {
            loadedOptions = new Options();
            this.globalSettingsDb.store(player, loadedOptions);
        }

        if (loadedOptions.useThreads && channel.type === "GUILD_TEXT") {
            const textChannel = channel as TextChannel;
            try {
                let gameTitle = "Wordle";
                const user = textChannel.members.get(player);
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
                await thread.members.add(player);
                return this.createGame(thread, player, loadedOptions);
            } catch (_e) {
                this.logger.warn(
                    "Could not create thread for channel",
                    textChannel.name,
                    ", falling back to normal channel-based game.",
                );
                return this.createGame(channel, player, loadedOptions);
            }
        } else if (!channel.isThread()) {
            // forbid this for threads, once they are archived, they should be left archived
            // and users should just create new threads
            return this.createGame(channel, player, loadedOptions);
        } else {
            return false;
        }
    }

    private async ready() {
        if (null !== this.client.user) {
            this.logger.info("Sucessfully logged in as", this.client.user.tag);
            this.commandParser.setThisId(this.client.user.id);
            if (null !== statsChannel) {
                try {
                    const reportingChannel = await this.client.channels.fetch(
                        statsChannel,
                    );
                    if (reportingChannel && reportingChannel.isText()) {
                        this.statsTracker = new StatsTracker(
                            this.logger.getChildLogger(),
                            reportingChannel as TextChannel,
                        );
                    } else {
                        this.logger.error(
                            "Could not fetch stats channel or is not a text channel!",
                        );
                    }
                } catch (e) {
                    this.logger.error("Could not fetch stats channel!", e);
                }
            }
        } else {
            this.logger.error("Error logging in..");
        }
    }
    private messageCreate(message: Message) {
        this.commandParser.messageReceived(message);
    }

    createGame(
        channel: TextBasedChannel,
        player: Snowflake,
        options: Options,
    ): boolean {
        const game = this.activeGames.get(channel.id);
        if (undefined === game || State.Ended === game.getState()) {
            this.activeGames.set(
                channel.id,
                new Game(
                    this.logger.getChildLogger(),
                    player,
                    channel,
                    this.commandParser,
                    this.listManager,
                    this.renderer,
                    this.globalSettingsDb,
                    options,
                    this.statsTracker,
                ),
            );

            return true;
        } else {
            return false;
        }
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
