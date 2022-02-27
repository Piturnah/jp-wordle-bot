import { Snowflake } from "discord.js";

import { Options } from "./game/Options";

// For now, this class does not do anything particularly..
// Later, we could think about adding persistence methods
// (regularly storing as a file, loading from files..).
export class SettingsDb {
    private readonly userSettings = new Map<Snowflake, Options>();

    store(user: Snowflake, options: Options): void {
        this.userSettings.set(user, options);
    }

    load(user: Snowflake): Options | undefined {
        return this.userSettings.get(user);
    }
}
