export enum CharState {
    Wrong,
    Moved,
    Correct,    
}

export class Game {
    words: string[];
    word: string;

    constructor() {
        this.words = [
            "まいとし"
        ]

        this.word = this.words[Math.floor(Math.random()*this.words.length)];
    }

    async make_guess(guess: string,) {
        if (guess === this.word) {
            return await true;
        }
        if (guess.length !== this.word.length) {
            return await false;
        }

        const chars: CharState[] = [];
        for (let i = 0; i < guess.length; i++) {
            if (this.word.charAt(i) === guess.charAt(i)) {
                chars[i] = CharState.Wrong;
            } else if (this.word.indexOf(guess.charAt(i)) > -1) {
                chars[i] = CharState.Moved;
            } else {
                chars[i] = CharState.Wrong;
            }
        }

        return await chars;
    }
}