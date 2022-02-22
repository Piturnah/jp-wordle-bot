import { MessageAttachment } from "discord.js";
import { Logger } from "tslog";
import {
    HorizontalImage,
    UltimateTextToImage,
    registerFont,
} from "ultimate-text-to-image";

import { CharResult, RenderParameters, Renderer, resolve } from "./interfaces";

export class Basic implements Renderer {
    private readonly fontAlias?: string;
    private readonly logger = new Logger();

    constructor(fontPath?: string) {
        if (undefined !== fontPath) {
            let fontFamily = fontPath;
            const lastSlashIndex = fontPath.lastIndexOf("/");
            if (-1 !== lastSlashIndex) {
                fontFamily = fontPath.substring(lastSlashIndex + 1);
            }
            const lastDot = fontFamily.lastIndexOf(".");
            if (-1 !== lastDot) {
                fontFamily = fontFamily.substring(0, lastDot);
            }
            this.logger.info(
                "Trying to register custom font",
                fontPath,
                "as font family",
                fontFamily,
            );
            registerFont(fontPath, { family: fontFamily });
            this.fontAlias = fontFamily;
        }
    }

    render(
        guessResult: CharResult[],
        fileName?: string,
        parameters?: RenderParameters,
    ): MessageAttachment {
        const params = parameters || new RenderParameters();
        const images: UltimateTextToImage[] = [];

        const fullString = guessResult
            .map((result) => result.character)
            .reduce((nextChar, currentWord) => currentWord + nextChar);
        guessResult.forEach((result) => {
            // Explanation
            //
            // This is an ugly trick to get individual images
            // that are still aligned correctly vertically
            // with regards to the entire word.
            //
            // First, we render the character on its on,
            // then we render the character + the entire original string
            // shifted so far to the right that it is not contained in the image.
            // We use the the fake image to determine the rendered width of
            // the character we actually want to print, and that in turn to
            // make-shift "center" the character in our final character image.
            const fakeImage = new UltimateTextToImage(
                " " != result.character ? result.character : "G",
                {
                    noAutoWrap: true,
                    fontFamily: this.fontAlias,
                    valign: "middle",
                    align: "center",
                    fontSize: params.dimensions.fontSize,
                },
            );

            fakeImage.render();

            const fakeWord = new UltimateTextToImage("gGyY" + fullString, {
                noAutoWrap: true,
                fontFamily: this.fontAlias,
                valign: "middle",
                align: "center",
                fontSize: params.dimensions.fontSize,
            });

            fakeWord.render();

            const backgroundColor = resolve(result.result, params.colors);
            images.push(
                new UltimateTextToImage(
                    result.character + "      gGyY" + fullString,
                    {
                        noAutoWrap: true,
                        fontFamily: this.fontAlias,
                        valign: "middle",
                        align: "left",
                        marginLeft: Math.floor(
                            (fakeWord.height * 1.4 - fakeImage.width) / 2,
                        ),
                        marginTop: Math.floor(fakeWord.height * 0.25),
                        marginBottom: Math.floor(fakeWord.height * 0.15),
                        width: Math.floor(fakeWord.height * 1.4),
                        backgroundColor: backgroundColor,
                        fontColor: "#000000",
                        fontSize: params.dimensions.fontSize,
                        borderSize: params.dimensions.borderSize,
                        borderColor: "#000000",
                    },
                ),
            );
        });
        return new MessageAttachment(
            new HorizontalImage(images, {
                valign: "middle",
                margin: 0,
            })
                .render()
                .toBuffer(),
            fileName ?? "result.jpg",
        );
    }
}
