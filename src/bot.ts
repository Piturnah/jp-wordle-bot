require("dotenv").config();

import { Client, Intents, Message, Snowflake } from "discord.js";
import { Game, CharState, State } from "./interfaces";
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
		let userId = message.author.id;
		let activeGame = this.activeGames.get(message.channelId);
		if (undefined !== activeGame) {
			switch (activeGame.state()) {
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
		} else {
		}
	}

	handleResponse(guessResult: boolean | CharState[]) {}

	prompt() {
		// TODO
	}
}

// https://discord.com/developers/docs/topics/gateway#gateway-intents
const client = new Client({
	intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES],
});

let bot = new Bot(client);

bot.start(process.env.DISCORD_TOKEN);
