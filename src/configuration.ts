import * as configFile from "../config.json";

export interface Configuration {
    token: string;
    debug?: boolean;
    font?: string;
    statsChannel?: string;
}

export const configuration: Readonly<Configuration> = { ...configFile };
