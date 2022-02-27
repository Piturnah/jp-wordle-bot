import { Snowflake, TextBasedChannel, User } from "discord.js";
import { Logger } from "tslog";

import { CommandParser, ListenerId } from "../commands";
import { LengthRange, ListIdentifier, ListManager } from "../list_manager";
import { Messages } from "../messages";
import { Basic as Renderer } from "../renderer";
import { SettingsDb } from "../settings_db";
import { Free } from "./Free";
import { Game } from "./Game";
import { Options } from "./Options";
import { Turns } from "./Turns";
import { WithInactivityTimeout } from "./WithInactivityTimeout";

export const MAX_INACTIVE_TIME = 90000;

export enum Mode {
    Turns = "turns",
    Free = "free",
}

export class Session extends WithInactivityTimeout {
    private readonly settingsDb: SettingsDb;
    private readonly listManager: ListManager;
    private readonly commandParser: CommandParser;
    private readonly logger: Logger;
    private readonly channelId: Snowflake;
    private readonly messages: Messages;
    private readonly listeners: ListenerId[];

    private options = new Options();
    private originalOwner = true;
    private state: "lobby" | Game | "ended" = "lobby";

    private players: User[];
    private owner: Snowflake;

    constructor(
        logger: Logger,
        owner: User,
        channel: TextBasedChannel,
        commandParser: CommandParser,
        listManager: ListManager,
        renderer: Renderer,
        settingsDb: SettingsDb,
    ) {
        super();
        this.logger = logger;
        this.channelId = channel.id;
        this.commandParser = commandParser;
        this.owner = owner.id;
        this.players = [owner];

        this.settingsDb = settingsDb;
        let loadedSettings = this.settingsDb.load(owner.id);
        if (undefined === loadedSettings) {
            loadedSettings = new Options();
        }
        this.options = loadedSettings;

        this.listManager = listManager;
        if (undefined === this.options.listIdentifier) {
            this.options.listIdentifier =
                this.listManager.getDefaultListForLanguage(
                    this.options.language,
                );
        }

        this.messages = new Messages(renderer, channel);

        this.listeners = this.setupListeners(commandParser);

        this.messages.lobbyText(this.owner, this.options);
    }

    private ifAllowed(
        player: Snowflake,
        players: Snowflake[],
        then: () => void,
    ) {
        if (
            "lobby" === this.state &&
            (players.length === 0 || players.indexOf(player) > -1)
        ) {
            // it's important if unintuitive to reset the timer beforehand,
            // as then() might actually cause the session to end..
            this.restartInactivityTimer();
            then();
            return true;
        }
        return false;
    }

    private setupListeners(commandParser: CommandParser): ListenerId[] {
        return [
            commandParser.register({
                channel: this.channelId,
                regEx: /!join/,
                listener: (player) =>
                    this.ifAllowed(
                        //
                        player.id,
                        [],
                        () => this.join(player),
                    ),
            }),

            commandParser.register({
                channel: this.channelId,
                regEx: /!leave/,
                listener: (player) =>
                    this.ifAllowed(
                        //
                        player.id,
                        [],
                        () => this.leave(player.id),
                    ),
            }),

            commandParser.register({
                channel: this.channelId,
                regEx: /!start/,
                listener: (player) =>
                    this.ifAllowed(
                        //
                        player.id,
                        [this.owner],
                        () => this.start(),
                    ),
            }),

            commandParser.register({
                channel: this.channelId,
                regEx: /!list/,
                listener: (player) =>
                    this.ifAllowed(
                        //
                        player.id,
                        [this.owner],
                        () => this.printCurrentListInfo(),
                    ),
            }),

            commandParser.register({
                channel: this.channelId,
                regEx: /!list (?<language>\w+)\/(?<list>\w+)/,
                listener: (player, input) =>
                    this.ifAllowed(
                        //
                        player.id,
                        [this.owner],
                        () => this.switchToList(input.language, input.list),
                    ),
            }),

            commandParser.register({
                channel: this.channelId,
                regEx: /!length (?<min>[1-9]\d*)( (?<max>[1-9]\d*))?/,
                listener: (player, input) =>
                    this.ifAllowed(
                        //
                        player.id,
                        [this.owner],
                        () =>
                            this.setWordLength(
                                parseInt(input.min),
                                parseInt(
                                    undefined !== input.max
                                        ? input.max.trim()
                                        : input.min,
                                ),
                            ),
                    ),
            }),

            commandParser.register({
                channel: this.channelId,
                regEx: /!mode (?<mode>turns|free)/,
                listener: (player, input) =>
                    this.ifAllowed(
                        //
                        player.id,
                        [this.owner],
                        () => this.setMode(input.mode),
                    ),
            }),

            commandParser.register({
                channel: this.channelId,
                regEx: /!guesses ((?<guessCount>[1-9]\d*)|(?<unlimited>unlimited))/,
                listener: (player, input) =>
                    this.ifAllowed(
                        //
                        player.id,
                        [this.owner],
                        () =>
                            this.setMaxGuesses(
                                undefined !== input.guessCount
                                    ? parseInt(input.guessCount)
                                    : undefined,
                            ),
                    ),
            }),
        ];
    }

    private setMaxGuesses(guesses?: number) {
        const previousGuessCount = this.options.maxAttempts;
        this.options.maxAttempts = guesses;
        this.messages.maxGuessesChanged(guesses);
        if (previousGuessCount !== guesses) {
            this.storeSettings();
        }
    }

    private setMode(modeAsString: string) {
        const prevMode = this.options.mode;
        let newMode = prevMode;
        switch (modeAsString) {
            case Mode.Turns:
                newMode = Mode.Turns;
                break;
            case Mode.Free:
                newMode = Mode.Free;
                break;
            default:
                this.logger.error(
                    "User managed to enter unknown mode string:",
                    modeAsString,
                );
                break;
        }

        if (prevMode !== newMode) {
            this.options.mode = newMode;
            this.messages.modeChanged(newMode);
            this.storeSettings();
        }
    }

    private setWordLength(min: number, max: number) {
        if (undefined !== this.options.listIdentifier) {
            if (min > max) {
                // fancy trick to swap the values without temporary
                max = [min, (min = max)][0];
            }
            const wordsLength = new LengthRange(min, max);
            if (
                undefined !==
                this.listManager.randomWord(
                    this.options.listIdentifier,
                    wordsLength,
                )
            ) {
                this.options.lengthRange = wordsLength;
                this.storeSettings();
                this.messages.wordSourceChanged(
                    wordsLength,
                    this.options.listIdentifier,
                );
            } else {
                this.messages.wordSourceChangeFailed(
                    this.options.listIdentifier,
                    this.options.lengthRange,
                );
            }
        } else {
            this.messages.noList();
        }
    }

    private switchToList(language: string, list: string): void {
        // First, check if there actually is at least a single word for this list by querying it..
        const listIdent = new ListIdentifier(language, list);
        if (
            undefined !==
            this.listManager.randomWord(listIdent, this.options.lengthRange)
        ) {
            this.options.listIdentifier = listIdent;
            this.options.language = listIdent.language;
            this.storeSettings();
            this.messages.wordSourceChanged(
                this.options.lengthRange,
                listIdent,
            );
        } else {
            this.messages.wordSourceChangeFailed(
                listIdent,
                this.options.lengthRange,
            );
        }
    }

    private storeSettings(): void {
        if (this.originalOwner) {
            this.settingsDb.store(this.owner, this.options);
        }
    }

    private printCurrentListInfo(): void {
        this.messages.listInfo(
            this.listManager,
            this.options.listIdentifier,
            this.options.lengthRange,
        );
    }

    getState(): "lobby" | Game | "ended" {
        return this.state;
    }

    join(player: User): void {
        if (
            this.players.findIndex(
                (presentPlayer) => presentPlayer.id === player.id,
            ) < 0
        ) {
            this.players.push(player);
            this.messages.joined(player.id);
        }
    }

    leave(player: Snowflake): number | "notFound" | "empty" {
        const index = this.players.findIndex(
            (presentPlayer) => presentPlayer.id === player,
        );
        if (-1 !== index) {
            this.players.splice(index, 1);
            if (this.players.length === 0) {
                this.messages.noPlayersLeft();
                this.cleanUp();
                return "empty";
            } else {
                if (this.owner === player) {
                    this.owner = this.players[0].id;
                    this.messages.ownerChanged(player, this.owner);
                    this.originalOwner = false;
                }

                return index;
            }
        } else {
            return "notFound";
        }
    }

    start() {
        if (undefined === this.options.listIdentifier) {
            this.options.listIdentifier =
                this.listManager.getDefaultListForLanguage(
                    this.options.language,
                );
        }
        if (undefined === this.options.listIdentifier) {
            this.logger.error(
                "Could not get default list for language",
                this.options.language,
                "!",
            );
        } else {
            const word = this.listManager.randomWord(
                this.options.listIdentifier,
                this.options.lengthRange,
            );

            if (undefined !== word) {
                this.logger.debug(
                    "New game has started in channel",
                    this.channelId,
                    ", word to be guessed is",
                    word,
                );

                this.state = (() => {
                    switch (this.options.mode) {
                        case Mode.Free:
                            return new Free({
                                word,
                                commandParser: this.commandParser,
                                listManager: this.listManager,
                                messages: this.messages,
                                channelId: this.channelId,
                                options: this.options,
                                whenOver: () => this.returnToLobby(),
                                leave: (player: Snowflake) =>
                                    this.leave(player),
                                players: this.players,
                                owner: () => this.owner,
                            });
                        case Mode.Turns:
                            return new Turns({
                                word,
                                commandParser: this.commandParser,
                                listManager: this.listManager,
                                messages: this.messages,
                                channelId: this.channelId,
                                options: this.options,
                                whenOver: () => this.returnToLobby(),
                                leave: (player: Snowflake) =>
                                    this.leave(player),
                                players: this.players,
                                owner: () => this.owner,
                            });
                    }
                })();
                this.stopInactivityTimer();
            } else {
                this.logger.error(
                    "Could not get word with length",
                    this.options.lengthRange,
                    "from list",
                    this.options.listIdentifier.getUserString(),
                );
            }
        }
    }

    private returnToLobby(): void {
        if ("ended" !== this.state) {
            this.state = "lobby";
            this.messages.lobbyText(this.owner, this.options);
            this.restartInactivityTimer();
        }
    }

    protected inactivityTimeout(): void {
        this.messages.timeout();
        this.cleanUp();
    }

    private cleanUp() {
        this.stopInactivityTimer();
        this.state = "ended";
        this.commandParser.remove(...this.listeners);
    }
}
