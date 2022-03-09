import { codeBlock } from "@discordjs/builders";
import { Snowflake, TextBasedChannel } from "discord.js";

import { Options } from "./game";

export type Result =
    | "timeout"
    | "guessLimitReached"
    | { guessesUntilSuccess: number };

class Data {
    lobbiesWithoutGamesStarted = 0;
    gameResults: { options: Options; result: Result }[] = [];
}

export class StatsTracker {
    private channel?: TextBasedChannel = undefined;
    private data: Data = new Data();

    private roundsPerChannel: Map<Snowflake, number> = new Map();

    constructor(channel: Promise<TextBasedChannel>, interval: number) {
        channel.then((tbChannel) => {
            this.channel = tbChannel;
            setInterval(() => this.write(), interval);
        });
    }

    ready(): boolean {
        return undefined !== this.channel;
    }

    lobbyStarted(channelId: Snowflake) {
        if (this.ready()) {
            this.roundsPerChannel.set(channelId, 0);
        }
    }

    lobbyEnded(channelId: Snowflake) {
        const roundsForThisChannel = this.roundsPerChannel.get(channelId);
        if (
            this.ready() &&
            undefined !== roundsForThisChannel &&
            0 === roundsForThisChannel
        ) {
            this.data.lobbiesWithoutGamesStarted++;
        }
        this.roundsPerChannel.delete(channelId);
    }

    roundEnded(channelId: Snowflake, settings: Options, result: Result) {
        const roundsForThisChannel = this.roundsPerChannel.get(channelId);
        if (this.ready() && undefined !== roundsForThisChannel) {
            this.roundsPerChannel.set(channelId, roundsForThisChannel + 1);
            this.data.gameResults.push({ options: settings, result });
        }
    }

    write() {
        if (
            undefined !== this.channel &&
            this.ready() &&
            new Data() !== this.data
        ) {
            this.channel.send(
                `Stats update!\n ${codeBlock(
                    JSON.stringify(this.data, null, 2),
                )}`,
            );
        }
    }
}
