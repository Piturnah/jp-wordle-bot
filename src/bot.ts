require("dotenv").config();

const { Game } = require("./game");

const { Client, Intents } = require("discord.js");

// https://discord.com/developers/docs/topics/gateway#gateway-intents
const client = new Client({ intents: [Intents.FLAGS.GUILDS, Intents.FLAGS.GUILD_MESSAGES] });

client.once("ready", () => {
	console.log(`${client.user.tag} successfully logged in at ${new Date().toTimeString()}`)
});

client.login(process.env.DISCORD_TOKEN);