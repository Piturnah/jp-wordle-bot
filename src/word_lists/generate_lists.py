# NOTE: REQUIRES https://github.com/scriptin/jmdict-simplified release in current directory as `source.json`

import json
import pykakasi

kks = pykakasi.kakasi()

def generate_lists(path, out):
    with open(path, "r", encoding="utf-8") as f:
        content = f.read()
    
    four_kana = []
    five_kana = []
    six_kana = []

    word_lists = {
        4: four_kana,
        5: five_kana,
        6: six_kana
    }
    for word in map(lambda x: kks.convert(x["kana"][0]["text"])[0]["hira"], json.loads(content)["words"]):
        if len(word) in word_lists.keys():
            word_lists[len(word)].append(word)
    
    with open(out, "w+", encoding="utf-8") as f:
        f.write(json.dumps(word_lists, indent=4, ensure_ascii=False))

if __name__ == "__main__":
    print(generate_lists("./source.json", "./words.json"))
