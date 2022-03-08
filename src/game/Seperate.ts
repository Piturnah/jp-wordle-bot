import { DMChannel, Snowflake, User } from "discord.js";
import { CharResult } from "src/interfaces";

import { Free } from "./Free";
import { Game, GameParams } from "./Game";

export class Seperate extends Game {
    private games: Map<Snowflake, Free> = new Map();
    private pendingPromises: Map<Snowflake, Promise<void>> = new Set();
    private notStartedGames: Set<Snowflake> = new Set();

    private usersLeftViaChannel: Set<Snowflake> = new Set();
    private usersLeftViaDm: Set<Snowflake> = new Set();

    constructor(params: GameParams) {
        super(params);

        params.players.forEach((player) =>
            this.pendingPromises.set(
                player.id,
                player
                    .createDM()
                    .then((dmChannel) =>
                        this.onChannelCreated(player, dmChannel),
                    )
                    .catch(() => this.couldNotCreateDmForPlayer(player)),
            ),
        );

        this.stopInactivityTimer();
    }

    private onChannelCreated(player: User, channel: DMChannel) {
        this.pendingPromises.delete(player.id);
        this.games.set(
            player.id,
            new Free({
                ...this.params,
                players: [player],
                owner: () => player.id,
                messages: this.params.messages.copyToOtherChannel(channel),
                whenOver: () => this.checkCompletion(),
                leave: () => {
                    this.usersLeftViaDm.add(player.id);
                    this.leave(player.id);

                    // TODO
                    return "empty";
                },
            }),
        );
    }

    private couldNotCreateDmForPlayer(player: User) {
        this.pendingPromises.delete(player.id);
        this.notStartedGames.add(player.id);
        // TODO: Message

        if (this.notStartedGames.size === this.params.players.length) {
            this.endedWith("couldNotCreateChannels");
        }
    }

    private checkCompletion() {
        // TODO
    }

    incorrectGuessMade(): void {
        // will not happen
    }

    cleanUpInternal(): void {
        [...this.games.values()].forEach((game) => game.cleanUp());
    }

    protected playersAllowedToGuess(): string[] | "all" {
        return [];
    }

    protected left(index: number, player: Snowflake): void {
        if (this.pendingPromises.has(player)) {
            this.usersLeftViaChannel.add(player);
        } else if (!this.usersLeftViaDm.has(player)) {
            this.usersLeftViaChannel.add(player);
            const game = this.games.get(player);
            if (undefined !== game) {
                game.endedWith("noPlayersLeft");
            }
        }
    }
}
