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

    render(guessResult: CharResult[], parameters?: RenderParameters): Buffer {
        const params = parameters || new RenderParameters();
        const images: UltimateTextToImage[] = [];
        guessResult.forEach((result) => {
            const backgroundColor = resolve(result.result, params.colors);
            images.push(
                new UltimateTextToImage(result.character, {
                    fontFamily: this.fontAlias,
                    valign: "bottom",
                    align: "center",
                    marginBottom: params.dimensions.marginBottom,
                    width: params.dimensions.imageSize,
                    height: params.dimensions.imageSize,
                    backgroundColor: backgroundColor,
                    fontColor: "#000000",
                    fontSize: params.dimensions.fontSize,
                    borderSize: params.dimensions.borderSize,
                    borderColor: "#000000",
                }),
            );
        });
        return new HorizontalImage(images, {
            valign: "middle",
            margin: 0,
        })
            .render()
            .toBuffer();
    }
}
