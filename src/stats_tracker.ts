import { codeBlock } from "@discordjs/builders";
import { TextBasedChannel } from "discord.js";
import { Logger } from "tslog";

import { Options } from "./game";

export type GameResult =
    | "revealed"
    | "left"
    | number
    | "timeout"
    | "guessesExhausted";

export class StatsTracker {
    private readonly channel?: TextBasedChannel;
    private readonly logger: Logger;

    constructor(logger: Logger, channel?: TextBasedChannel) {
        this.logger = logger;
        this.channel = channel;
    }

    gameEnded(track: boolean, result: GameResult, options: Options) {
        if (track && undefined !== this.channel) {
            this.channel
                .send(
                    `Game ended!${codeBlock(
                        JSON.stringify(
                            { result: result, options: options },
                            null,
                            4,
                        ),
                    )}`,
                )
                .catch((e) => {
                    this.logger.warn("Could not send to stats channel", e);
                });
        }
    }
}
