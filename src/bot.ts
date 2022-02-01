require("dotenv").config();

import { Client, Intents, Message, Snowflake, TextChannel } from "discord.js";
import { Game, CharState, State } from "./interfaces";
import { Game as GameImpl } from "./game";
import { COMMANDS } from "./commands";

class Bot {
	private client: Client;

	private activeGames = new Map<Snowflake, Game>();

	constructor(client: Client) {
		this.client = client;
	}

	start(token: string | undefined) {
		client.once("ready", () => this.ready());
		client.on("messageCreate", (message: Message) =>
			this.messageCreate(message)
		);
		client.login(token);
	}

	private ready() {
		if (null !== client.user)
			console.log(
				`${
					client.user.tag
				} successfully logged in at ${new Date().toTimeString()}`
			);
	}

	private messageCreate(message: Message) {
		const userId = message.author.id;
		const activeGame = this.activeGames.get(message.channelId);
		if (undefined !== activeGame) {
			switch (activeGame.getState()) {
				case State.Setup:
					if (
						message.content.startsWith(
							COMMANDS.JOIN
						)
					) {
						activeGame.join(userId);
					} else if (
						message.content.startsWith(
							COMMANDS.START
						)
					) {
						if (activeGame.start(userId)) {
							this.prompt(
								activeGame.nextGuessExpectedFrom(),
								message.channelId
							);
						}
					}
					break;
				case State.Running:
					this.handleResponse(
						activeGame.makeGuess(
							userId,
							message.content,
						),
						message.author.id,
						message.channelId
					);
					break;
			}
		} else if (message.content.startsWith(COMMANDS.WAKE_UP)) {
			this.activeGames.set(
				message.channelId,
				new GameImpl(userId)
			);
			this.sendMessage(message.channelId, `Temporary feedback to show the game has been created`);
		}
	}

	private handleResponse(guessResult: boolean | CharState[], userId: Snowflake, channelId: Snowflake) {
		if (typeof guessResult == "boolean") {
			if (guessResult as boolean) {
				// TODO: Win message.
			} else {
				this.sendMessage(channelId, `Received a bad guess from <@${userId}>. Guess must be 4 chars long.`)
			}
		} else {
		}
	}

	private prompt(userId: Snowflake, channelId: Snowflake) {
		this.sendMessage(channelId, `<@${userId}>: It is your turn.`)
	}

	private sendMessage(channelId: Snowflake, message: string): boolean {
		const channel = this.client.channels.cache.get(channelId);
		if (undefined !== channel) {
			const textChannel = channel as TextChannel;
			textChannel.send(message);
			return true;
		}
		console.warn(`No channel cached with ID ${channelId}!`)
		return false;
	}
}

// https://discord.com/developers/docs/topics/gateway#gateway-intents
const client = new Client({
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

let bot = new Bot(client);

bot.start(process.env.DISCORD_TOKEN);
