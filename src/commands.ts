import { Message, Snowflake } from "discord.js";
import { Logger } from "tslog";

export type Listener = (
    channel: Snowflake,
    user: Snowflake,
    matchedString: string[],
) => void;

interface Command {
    regEx: RegExp;
    listener: Listener;
}

export class CommandParser {
    private readonly globalCommands: Command[] = [];
    private readonly perChannelCommands: Map<Snowflake, Command[]> = new Map();
    private readonly logger = new Logger();

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
        let matched = false;
        for (const command of this.globalCommands) {
            matched = CommandParser.try(message, command);
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
                    matched = CommandParser.try(message, command);
                    if (matched) {
                        break;
                    }
                }
            }
        }
        // if (!matched) {
        //     this.logger.warn(
        //         "No command not matched therefore silently ignored. Message:",
        //         message,
        //     );
        // }
    }

    static try(message: Message, command: Command): boolean {
        const matchResult = message.content.match(command.regEx);
        if (null !== matchResult) {
            command.listener(
                message.channelId,
                message.author.id,
                matchResult.slice(1),
            );
            return true;
        }
        return false;
    }
}
