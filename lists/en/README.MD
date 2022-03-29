### Regarding the lists provided here

#### General
The lists that you find here (*except nyt.json*) are based on the [corpora repository](https://github.com/dariusk/corpora/tree/f742381fdcc8ee5f0d187752e2a3e27093881202), whose contents are licensed (resp. non-licensed) as Public Domain. See their repository for details.

You can reproduce these lists by running the following script in the root of a copy of the corpora repository: 

```javascript
const fs = require("fs");

function generate(words, name, def = false) {
  console.log("Generate( ", words, ", ", name, ", ", def, " )");

  const result = {
    debug: false,
    default: def,
    words: [],
  };

  words.forEach((word) => {
    result.words.push({ word: word });
  });

  fs.writeFile(name + ".json", JSON.stringify(result), (err) => {
    if (err) {
      console.error("lol, we are screwed");
    }
  });
}

const commonWords = require("./data/words/common.json").commonWords;
const nouns = require("./data/words/nouns.json").nouns;
const verbs = require("./data/words/infinitive_verbs.json");
const adjectives = require("./data/words/adjs.json").adjs;

generate(commonWords, "common", false);
generate(nouns, "nouns", false);
generate(verbs, "verbs", false);
generate(adjectives, "adjectives", false);

const combined = [...new Set(commonWords.concat(nouns, verbs, adjectives))];

generate(combined, "combined", true);
```

#### nyt.json
This is the list that is used in the official NYT Wordle game. It was taken from its source code. It was converted with to our format with the same method as above.
