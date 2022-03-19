import { codeBlock } from "@discordjs/builders";
import { TextBasedChannel } from "discord.js";
import { Logger } from "tslog";

import { Options } from "./game";

export class StatsTracker {
    private readonly channel?: TextBasedChannel;
    private readonly logger: Logger;

    constructor(logger: Logger, channel?: TextBasedChannel) {
        this.logger = logger;
        this.channel = channel;
    }

    gameStarted(options: Options) {
        if (undefined !== this.channel) {
            this.channel
                .send(
                    `Game started!${codeBlock(
                        JSON.stringify(options, null, 4),
                    )}`,
                )
                .catch((e) => {
                    this.logger.warn("Could not send to stats channel", e);
                });
        }
    }
}
