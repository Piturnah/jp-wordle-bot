require("dotenv").config();

import { Client, Intents, Message, Snowflake, TextChannel } from "discord.js";
import { Game, CharState, State } from "./interfaces";
import { Game as GameImpl } from "./game";
import { COMMANDS } from "./commands";

class Bot {
	client: Client;

	activeGames = new Map<Snowflake, Game>();

	constructor(client: Client) {
		this.client = client;
	}

	start(token: string | undefined) {
		client.once("ready", this.ready);
		client.on("messageCreate", this.messageCreate);
		client.login(token);
	}
	ready() {
		if (null !== client.user)
			console.log(
				`${
					client.user.tag
				} successfully logged in at ${new Date().toTimeString()}`
			);
	}

	messageCreate(message: Message) {
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
						}
					}
					break;
				case State.Running:
					this.handleResponse(
						activeGame.makeGuess(
							userId,
							message.content
						)
					);
					break;
			}
		} else if (message.content.startsWith(COMMANDS.WAKE_UP)) {
			this.activeGames.set(
				message.channelId,
				new GameImpl(userId)
			);
		}
	}

	handleResponse(guessResult: boolean | CharState[]) {
		if (typeof guessResult == "boolean") {
			if (guessResult as boolean) {
				// TODO: Win message.
			}
		} else {
		}
	}

	prompt(userId: Snowflake, channelId: Snowflake) {
		const channel = this.client.channels.cache.get(channelId);
		if (undefined !== channel) {
			const textChannel = channel as TextChannel;
			textChannel.send(`@${userId}: It is your
						 turn.`);
		}
	}
}

// https://discord.com/developers/docs/topics/gateway#gateway-intents
const client = new Client({
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

let bot = new Bot(client);

bot.start(process.env.DISCORD_TOKEN);
