import { DMChannel, Snowflake, User } from "discord.js";
import { CharResult } from "src/interfaces";

import { Free } from "./Free";
import { Game, GameParams } from "./Game";

export class Seperate extends Game {
    private games: Map<Snowflake, Free> = new Map();
    private failedChannels = 0;

    constructor(params: GameParams) {
        super(params);

        params.players.forEach((player) =>
            player
                .createDM()
                .then((dmChannel) => this.onChannelCreated(player, dmChannel))
                .catch(() => this.couldNotCreateDmForPlayer(player)),
        );

        this.stopInactivityTimer();
    }

    private onChannelCreated(player: User, channel: DMChannel) {
        this.games.set(
            player.id,
            new Free({
                ...this.params,
                players: [player],
                owner: () => player.id,
                messages: this.params.messages.copyToOtherChannel(channel),
                whenOver: (game) => this.recordResult(player, game),
                leave: () => {
                    this.leave(player.id);
                    // TODO
                    return "empty";
                },
            }),:
        );
    }

    private couldNotCreateDmForPlayer(player: User) {
        // TODO: Message
        this.failedChannels++;

        if (++this.failedChannels === this.params.players.length) {
            this.endedWith("couldNotCreateChannels");
        }
    }

    private recordResult(player: User, game: Game) {
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
	    if 
    }
}
