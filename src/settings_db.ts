import { Snowflake } from "discord.js";
import * as fs from "fs";
import * as path from "path";
import { Logger } from "tslog";

import {
    TimeInterval,
    configuration,
    toMillisecondsInterval,
} from "./configuration";
import { Options } from "./game";

interface UserData {
    lastUpdated: number;
    options: Options;
}

const StandardInterval: TimeInterval = {
    value: 1,
    unit: "hours",
};

const LatestFileName = "latest.json";
function regularFileName(interval: number): string {
    return `regular_${interval}.json`;
}

export class SettingsDb {
    private userSettings = new Map<Snowflake, UserData>();
    private readonly logger: Logger;
    private storesSinceStart = 0;
    private intervalId?: ReturnType<typeof setInterval>;

    constructor(logger: Logger) {
        this.logger = logger;
    }

    restore() {
        if (undefined !== configuration.backup) {
            if (fs.existsSync(configuration.backup.folder)) {
                const latestBackup = path.join(
                    configuration.backup.folder,
                    LatestFileName,
                );
                if (fs.existsSync(latestBackup)) {
                    this.logger.info(
                        "Attempting to restore user settings from",
                        latestBackup,
                    );
                    try {
                        const data: [Snowflake, UserData][] = JSON.parse(
                            fs.readFileSync(latestBackup, {
                                encoding: "utf8",
                                flag: "r",
                            }),
                        );
                        this.userSettings = new Map(data);
                        this.clearExpiredData();
                        this.storesSinceStart = 1;
                        this.logger.info(
                            "Sucessfully restored user settings of",
                            this.userSettings.size,
                            "users",
                        );
                    } catch (error) {
                        this.logger.warn(
                            "Could not restore from",
                            latestBackup,
                            "due to error:",
                            error,
                        );
                    }
                }
            }
        }
    }

    start() {
        if (undefined !== configuration.backup) {
            let duration = toMillisecondsInterval(StandardInterval);
            if (undefined !== configuration.backup.regular) {
                duration = toMillisecondsInterval(
                    configuration.backup.regular.interval,
                );
            }
            this.intervalId = setInterval(() => {
                this.clearExpiredData();
                this.store();
                ++this.storesSinceStart;
            }, duration);
        }
    }

    shutdown() {
        if (undefined !== this.intervalId) {
            clearInterval(this.intervalId);
        }
        if (undefined !== configuration.backup)
            this.storeTo(
                this.encoded(),
                configuration.backup.folder,
                LatestFileName,
            );
    }

    private clearExpiredData() {
        if (undefined !== configuration.backup) {
            const maxRetentionMilliseconds = toMillisecondsInterval(
                configuration.backup.retentionPeriod,
            );
            const now = new Date();
            const toBeRemoved: Snowflake[] = [];

            this.userSettings.forEach((value, key) => {
                if (
                    now.getTime() - value.lastUpdated >
                    maxRetentionMilliseconds
                ) {
                    toBeRemoved.push(key);
                }
            });

            if (toBeRemoved.length > 0) {
                this.logger.info(
                    "Removing",
                    toBeRemoved.length,
                    "user settings as they were not used for",
                    configuration.backup.retentionPeriod,
                );
                toBeRemoved.forEach((id) => this.userSettings.delete(id));
            }
        }
    }

    private encoded(): string {
        const data: [Snowflake, UserData][] = Array.from(
            this.userSettings.entries(),
        );
        return JSON.stringify(data, null, 4);
    }

    private store() {
        const iteration = this.storesSinceStart;
        if (
            undefined !== configuration.backup &&
            undefined !== configuration.backup.regular
        ) {
            const data = this.encoded();
            this.storeTo(data, configuration.backup.folder, regularFileName(1));
            if (undefined !== configuration.backup.regular.additionalBackups) {
                // declared locally because TypeScript cannot reason about it otherwise
                const folder = configuration.backup.folder;
                configuration.backup.regular.additionalBackups
                    .filter(
                        // uniqueness
                        (value, index, vector) =>
                            vector.indexOf(value) === index,
                    )
                    .filter(
                        // value is positive and greater than 1
                        (value) => value % 1 === 0 && 1 < value,
                    )
                    .filter(
                        // it's actually this backup's turn
                        (value) => value % iteration === 0,
                    )
                    .forEach((value) => {
                        this.storeTo(data, folder, regularFileName(value));
                    });
            }
        }
    }

    private storeTo(data: string, folder: string, fileName: string) {
        const file = path.join(folder, fileName);
        try {
            if (!fs.existsSync(folder)) {
                fs.mkdirSync(folder, { recursive: true });
            }
            this.logger.info("Writing to", file);
            const now = new Date();
            fs.writeFileSync(file, data, {
                flag: "w",
            });
            this.logger.info(
                "Wrote to",
                file,
                "in",
                new Date().getMilliseconds() - now.getMilliseconds(),
                "ms",
            );
        } catch (error) {
            this.logger.error(
                "Failed to write to file",
                path,
                ", reason:",
                error,
            );
        }
    }

    update(user: Snowflake, options: Options): void {
        this.userSettings.set(user, {
            lastUpdated: new Date().getTime(),
            options,
        });
    }

    load(user: Snowflake): Options | undefined {
        const data = this.userSettings.get(user);
        // the spread operator is here because otherwise you don't get
        // the methods defined on the options class and children
        return undefined !== data ? data.options : undefined;
    }
}
