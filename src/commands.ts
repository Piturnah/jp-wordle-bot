import { Message, Snowflake } from "discord.js";
import { Logger } from "tslog";

export type Listener = (
    channel: Snowflake,
    user: Snowflake,
    matchedGroups: { [key: string]: string },
) => boolean;

interface Command {
    regEx: RegExp;
    listener: Listener;
}

export class CommandParser {
    private readonly logger: Logger;
    private readonly globalCommands: Command[] = [];
    private readonly perChannelCommands: Map<Snowflake, Command[]> = new Map();
    private thisId?: Snowflake;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    setThisId(id: Snowflake) {
        this.thisId = id;
    }

    registerGlobalListener(regEx: RegExp, listener: Listener) {
        this.globalCommands.push({ regEx: regEx, listener: listener });
    }

    registerChannelListener(
        channel: Snowflake,
        regEx: RegExp,
        listener: Listener,
    ) {
        let commands = this.perChannelCommands.get(channel);
        if (undefined === commands) {
            commands = [];
            this.perChannelCommands.set(channel, commands);
        }
        commands.push({ regEx: regEx, listener: listener });
    }

    removeAllForChannel(channel: Snowflake): void {
        this.perChannelCommands.delete(channel);
    }

    messageReceived(message: Message) {
        if (this.thisId !== message.author.id) {
            let matched = false;
            for (const command of this.globalCommands) {
                matched = tryMatch(message, command);
                if (matched) {
                    break;
                }
            }
            if (!matched) {
                const channelSpecificCommands = this.perChannelCommands.get(
                    message.channelId,
                );
                if (undefined !== channelSpecificCommands) {
                    for (const command of channelSpecificCommands) {
                        if (tryMatch(message, command)) {
                            matched = true;
                            break;
                        }
                    }
                }
            }
            if (!matched) {
                this.logger.debug(
                    "Command not matched therefore silently ignored. Message:",
                    message.content,
                );
            }
        }
    }
}

function tryMatch(message: Message, command: Command): boolean {
    const matchResult = command.regEx.exec(message.content);
    if (null !== matchResult && matchResult[0] === message.content) {
        if (
            command.listener(
                message.channelId,
                message.author.id,
                matchResult.groups ?? {},
            )
        ) {
            return true;
        }
    }
    return false;
}
