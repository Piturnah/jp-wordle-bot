import { Message, Snowflake, TextBasedChannel } from "discord.js";
import { Logger } from "tslog";

export interface ListenerId {
    readonly channel?: Snowflake;
    readonly localId: LocalListenerId;
}

type LocalListenerId = number;

export type Listener = (
    user: Snowflake,
    matchedGroups: { [key: string]: string },
    channel: TextBasedChannel,
) => boolean;

interface Command {
    id: LocalListenerId;
    regEx: RegExp;
    listener: Listener;
}

class ChannelData {
    private nextId: LocalListenerId = 0;
    private freedIds: LocalListenerId[] = [];
    commands: Command[] = [];

    getNextId(): LocalListenerId {
        let id = this.freedIds.pop();
        if (undefined === id) {
            id = this.nextId++;
        }
        return id;
    }

    remove(id: LocalListenerId): Command | undefined {
        const index = this.commands.findIndex((command) => {
            return command.id === id;
        });
        if (index > -1) {
            const command = this.commands.splice(index, 1)[0];
            this.freedIds.push(id);
            return command;
        } else {
            return undefined;
        }
    }

    add(regEx: RegExp, listener: Listener): LocalListenerId {
        const id = this.getNextId();
        this.commands.push({ id, regEx, listener });
        return id;
    }

    empty(): boolean {
        return 0 === this.commands.length;
    }
}

export interface RegistrationRequest {
    channel?: Snowflake;
    regEx: RegExp;
    listener: Listener;
}

export class CommandParser {
    private readonly logger: Logger;
    private readonly globalCommands: ChannelData = new ChannelData();
    private readonly perChannelCommands: Map<Snowflake, ChannelData> =
        new Map();
    private thisId?: Snowflake;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    setThisId(id: Snowflake) {
        this.thisId = id;
    }

    register(request: RegistrationRequest): ListenerId {
        if (undefined === request.channel) {
            return this.registerGlobalListener(request.regEx, request.listener);
        } else {
            return this.registerChannelListener(
                request.channel,
                request.regEx,
                request.listener,
            );
        }
    }

    private registerGlobalListener(
        regEx: RegExp,
        listener: Listener,
    ): ListenerId {
        return { localId: this.globalCommands.add(regEx, listener) };
    }

    private registerChannelListener(
        channel: Snowflake,
        regEx: RegExp,
        listener: Listener,
    ): ListenerId {
        let commands = this.perChannelCommands.get(channel);
        if (undefined === commands) {
            commands = new ChannelData();
            this.perChannelCommands.set(channel, commands);
        }
        return {
            channel,
            localId: commands.add(regEx, listener),
        };
    }

    remove(...ids: ListenerId[]) {
        ids.forEach((id) => {
            if (undefined === id.channel) {
                this.globalCommands.remove(id.localId);
            } else {
                const channelCommands = this.perChannelCommands.get(id.channel);
                if (undefined !== channelCommands) {
                    channelCommands.remove(id.localId);
                }
            }
        });
    }

    anyRegisteredFor(channel: Snowflake): boolean {
        const listeners = this.perChannelCommands.get(channel);
        return undefined !== listeners && !listeners.empty();
    }

    messageReceived(message: Message) {
        if (this.thisId !== message.author.id) {
            let matched = false;
            for (const command of this.globalCommands.commands) {
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
                    for (const command of channelSpecificCommands.commands) {
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
                message.channel,
                message.author.id,
                matchResult.groups ?? {},
            )
        ) {
            return true;
        }
    }
    return false;
}
