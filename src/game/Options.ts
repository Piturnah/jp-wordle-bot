import { LengthRange, ListIdentifier } from "../list_manager";
import { Mode } from "./Session";

export class Options {
    mode = Mode.Turns;
    checkWords = false;
    turnTimeout = 42000;
    maxAttempts? = 12;
    language = "en";
    listIdentifier?: ListIdentifier;
    lengthRange: LengthRange = new LengthRange(4, 6);
}
