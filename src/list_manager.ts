import * as fs from "fs";

export class Settings {
    listPath = "./lists";
    separator = "/";
    debug = false;
}

export class DebugMode extends Settings {
    debug = true;
}

export interface Meaning {
    language: string;
    meaning: string;
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
    private settings: Settings;
    private allWords: Map<Language, Set<Word>> = new Map();
    private lists: Map<
        Language,
        Map<List, Map<WordLength, Map<Word, AdditionalInfo | undefined>>>
    > = new Map();
    private defaultsPerLanguage: Map<Language, List> = new Map();

    constructor(settings: Settings = new Settings()) {
        this.settings = settings;
        const dirEntries = fs.readdirSync(this.settings.listPath, {
            withFileTypes: true,
        });
        [...dirEntries].forEach((dirEntry) => {
            if (dirEntry.isDirectory()) {
                const language = dirEntry.name;
                const allWords: Set<string> = new Set();
                this.allWords.set(language, allWords);
                const lists = new Map();
                this.lists.set(language, lists);
                ListManager.fill(
                    (list) => this.defaultsPerLanguage.set(language, list),
                    this.settings.listPath + this.settings.separator + language,
                    this.settings.separator,
                    this.settings.debug,
                    allWords,
                    lists,
                );
            }
        });
    }

    private static fill(
        setDefault: (list: List) => void,
        path: string,
        separator: string,
        debugOnly: boolean,
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
                const contents = JSON.parse(
                    fs.readFileSync(path + separator + dirEntry.name, {
                        encoding: "utf8",
                    }),
                );
                if (
                    (debugOnly &&
                        undefined !== contents.debug &&
                        (contents.debug as boolean)) ||
                    (!debugOnly &&
                        (undefined === contents.debug ||
                            !(contents.debug as boolean)))
                ) {
                    const words: Map<
                        WordLength,
                        Map<string, AdditionalInfo>
                    > = new Map();
                    const listName = dirEntry.name.substring(
                        0,
                        dirEntry.name.length - ".json".length,
                    );
                    lists.set(listName, words);
                    if (
                        undefined !== contents.default &&
                        (contents.default as boolean)
                    ) {
                        setDefault(listName);
                    }
                    [...contents.words].forEach((word) => {
                        const wordAsString: string = word.word;
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
                    });
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
                    const wordsPerLength: Map<WordLength, number> = new Map();
                    const listContents = lists.get(listName) || new Map();
                    for (const length of listContents.keys()) {
                        wordsPerLength.set(
                            length,
                            listContents.get(length).size,
                        );
                    }
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

    randomWord(
        listIdent: ListIdentifier,
        length: WordLength,
    ): Word | undefined {
        const listsForLanguage = this.lists.get(listIdent.language);
        if (undefined !== listsForLanguage) {
            const list = listsForLanguage.get(listIdent.list);
            if (undefined !== list) {
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
