import * as fs from "fs";
import { Logger } from "tslog";

export class Settings {
    separator = "/";
    debug = false;
    blacklistExpressions = [
        /[\u30a0-\u30ff]/g, // katakana
    ];
}

export class DebugMode extends Settings {
    debug = true;
}

export interface Meaning {
    language: string;
    definitions: string[];
}
export interface AdditionalInfo {
    alternateSpelling?: string;
    meaning?: Meaning;
}

export type Language = string;
export type List = string;
export type Word = string;
export type WordLength = number;

export class ListIdentifier {
    readonly language: Language;
    readonly list: List;

    constructor(language: Language, list: List) {
        this.language = language;
        this.list = list;
    }

    getUserString(): string {
        return this.language + "/" + this.list;
    }

    static parse(userString: string): ListIdentifier | undefined {
        const values = userString.split("/");
        if (2 === values.length) {
            return new ListIdentifier(values[0], values[1]);
        } else {
            return undefined;
        }
    }
}

export interface ListStats {
    wordsPerLength: Map<WordLength, number>;
}

export interface ListDetails {
    list: ListIdentifier;
    listStats: ListStats;
}

function addIfNotPresent<Key, Value>(
    map: Map<Key, Value>,
    key: Key,
    producer: () => Value,
): Value {
    let presentValue = map.get(key);
    if (undefined === presentValue) {
        presentValue = producer();
        map.set(key, presentValue);
    }
    return presentValue;
}
export class ListManager {
    private readonly logger = new Logger();
    private settings: Settings;
    private allWords: Map<Language, Set<Word>> = new Map();
    private lists: Map<
        Language,
        Map<List, Map<WordLength, Map<Word, AdditionalInfo | undefined>>>
    > = new Map();
    private defaultsPerLanguage: Map<Language, List> = new Map();

    constructor(settings: Settings = new Settings()) {
        this.settings = settings;
    }

    load(path = "./lists") {
        this.logger.info("Loading lists from folder", path);
        fs.readdirSync(path, {
            withFileTypes: true,
        }).forEach((dirEntry) => {
            if (dirEntry.isDirectory()) {
                const language = dirEntry.name;
                this.logger.info("Loading lists for language: ", language);
                const allWords: Set<string> = new Set();
                this.allWords.set(language, allWords);
                const lists = new Map();
                this.lists.set(language, lists);
                this.loadListsForLanguage(
                    language,
                    path + this.settings.separator + language,
                    allWords,
                    lists,
                );
            }
        });
    }

    private loadListsForLanguage(
        language: Language,
        path: string,
        allWords: Set<string>,
        lists: Map<
            List,
            Map<WordLength, Map<Word, AdditionalInfo | undefined>>
        >,
    ) {
        fs.readdirSync(path, {
            withFileTypes: true,
        }).forEach((dirEntry) => {
            if (dirEntry.isFile() && dirEntry.name.endsWith(".json")) {
                this.logger.info("Attempting to load", dirEntry.name);
                const contents = JSON.parse(
                    fs.readFileSync(
                        path + this.settings.separator + dirEntry.name,
                        {
                            encoding: "utf8",
                        },
                    ),
                );
                const listName = dirEntry.name.substring(
                    0,
                    dirEntry.name.length - ".json".length,
                );
                if (
                    (this.settings.debug &&
                        undefined !== contents.debug &&
                        (contents.debug as boolean)) ||
                    (!this.settings.debug &&
                        (undefined === contents.debug ||
                            !(contents.debug as boolean)))
                ) {
                    const words: Map<
                        WordLength,
                        Map<string, AdditionalInfo>
                    > = new Map();
                    lists.set(listName, words);
                    if (
                        undefined !== contents.default &&
                        (contents.default as boolean)
                    ) {
                        this.defaultsPerLanguage.set(language, listName);
                        this.logger.info(
                            "Setting list",
                            listName,
                            "as default for language",
                            language,
                        );
                    }
                    [...contents.words].forEach((word) => {
                        const wordAsString: string = word.word;
                        let blacklisted = false;
                        for (const pattern of this.settings
                            .blacklistExpressions) {
                            if (wordAsString.match(pattern)) {
                                blacklisted = true;
                                this.logger.debug(
                                    "Word",
                                    wordAsString,
                                    "was ignored as it was blacklisted by pattern",
                                    pattern.toString(),
                                );
                                break;
                            }
                        }
                        if (!blacklisted) {
                            const wordLength = wordAsString.length;
                            allWords.add(wordAsString);

                            const wordsWithSameLength = addIfNotPresent(
                                words,
                                wordLength,
                                () => new Map(),
                            );

                            wordsWithSameLength.set(
                                wordAsString,
                                word.additionalInfo,
                            );
                        }
                    });
                    this.logger.info(
                        "List",
                        listName,
                        "succesfully loaded. Total word count:",
                        Array.from(
                            ListManager.computeWordsPerLength(words).entries(),
                        ).reduce(
                            (sum: number, entry): number => sum + entry[1],
                            0,
                        ),
                    );
                } else {
                    this.logger.info(
                        "List",
                        listName,
                        "ignored as debug flag was not",
                        this.settings.debug,
                    );
                }
            }
        });
    }

    getLanguages(): Language[] {
        return Array.from(this.allWords.keys());
    }

    getLists(language: Language): ListIdentifier[] {
        return this.getListsWithDetails(language).map(
            (details) => details.list,
        );
    }

    getListsWithDetails(language: Language): ListDetails[] {
        const lists = this.lists.get(language);
        if (undefined !== lists) {
            return Array.from(lists.keys()).map(
                (listName: string): ListDetails => {
                    const listContents = lists.get(listName) || new Map();
                    const wordsPerLength =
                        ListManager.computeWordsPerLength(listContents);
                    return {
                        list: new ListIdentifier(language, listName),
                        listStats: { wordsPerLength: wordsPerLength },
                    };
                },
            );
        } else {
            return [];
        }
    }

    private static computeWordsPerLength(
        list: Map<WordLength, Map<Word, AdditionalInfo>>,
    ): Map<WordLength, number> {
        const wordsPerLength: Map<WordLength, number> = new Map();

        for (const entry of list.entries()) {
            wordsPerLength.set(entry[0], entry[1].size);
        }
        return new Map([...wordsPerLength.entries()].sort());
    }

    randomWord(
        listIdent: ListIdentifier,
        length?: WordLength,
    ): Word | undefined {
        const listsForLanguage = this.lists.get(listIdent.language);
        if (undefined !== listsForLanguage) {
            const list = listsForLanguage.get(listIdent.list);
            if (undefined !== list) {
                if (undefined === length) {
                    const availableLengths: number[] = Array.from(list.keys())
                        .map((length) =>
                            new Array(
                                (list.get(length) ?? new Map()).size ?? 0,
                            ).fill(length),
                        )
                        .flat();
                    length =
                        availableLengths[
                            Math.floor(Math.random() * availableLengths.length)
                        ];
                }
                const wordsWithRequiredLength = list.get(length);
                if (undefined !== wordsWithRequiredLength) {
                    // TODO: Potential performance issue, as we create a pretty big array every time..
                    const words = Array.from(wordsWithRequiredLength.keys());
                    return words[Math.floor(Math.random() * words.length)];
                }
            }
        }
        return undefined;
    }

    checkGlobal(language: Language, word: Word): boolean {
        const wordsInLanguage = this.allWords.get(language);
        if (undefined !== wordsInLanguage) {
            return wordsInLanguage.has(word);
        }
        return false;
    }

    checkLocal(listIdent: ListIdentifier, word: Word): boolean {
        const listsForLanguage = this.lists.get(listIdent.language);
        if (undefined !== listsForLanguage) {
            const list = listsForLanguage.get(listIdent.list);
            if (undefined !== list) {
                const wordsWithRequiredLength = list.get(word.length);
                if (undefined !== wordsWithRequiredLength) {
                    return wordsWithRequiredLength.has(word);
                }
            }
        }
        return false;
    }

    getDefaultListForLanguage(language: Language): ListIdentifier | undefined {
        const list = this.defaultsPerLanguage.get(language);
        if (undefined !== list) {
            return new ListIdentifier(language, list);
        } else {
            return undefined;
        }
    }
}
