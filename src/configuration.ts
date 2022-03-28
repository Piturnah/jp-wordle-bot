import * as configFile from "../config.json";

export interface Configuration {
    token: string;
    debug: boolean;
    font?: string;
    statsChannel?: string;
    backup?: {
        folder: string;
        retentionPeriod: TimeInterval;
        regular?: {
            interval: TimeInterval;
            additionalBackups?: number[];
        };
    };
}

const defaults = {
    debug: false,
    backup: {
        folder: "./backup",
        retentionPeriod: {
            value: 3,
            unit: "months" as TimeUnit,
        },
        regular: {
            interval: {
                value: 1,
                unit: "hours" as TimeUnit,
            },
            additionalBackups: [24, 24 * 7],
        },
    },
};

export type TimeUnit =
    | "seconds"
    | "minutes"
    | "hours"
    | "days"
    | "weeks"
    | "months";

export function toMilliseconds(unit: TimeUnit): number {
    switch (unit) {
        case "seconds":
            return 1000;
        case "minutes":
            return 60 * toMilliseconds("seconds");
        case "hours":
            return 60 * toMilliseconds("minutes");
        case "days":
            return 24 * toMilliseconds("hours");
        case "weeks":
            return 7 * toMilliseconds("days");
        case "months":
            return 4 * toMilliseconds("weeks");
    }
}

export function toMillisecondsInterval(interval: TimeInterval) {
    return interval.value * toMilliseconds(interval.unit);
}

export interface TimeInterval {
    value: number;
    unit: TimeUnit;
}

export const configuration: Readonly<Configuration> = {
    ...defaults,
    ...configFile,
};
