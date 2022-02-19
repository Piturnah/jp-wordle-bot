import { HorizontalImage, UltimateTextToImage } from "ultimate-text-to-image";

import { CharResult, RenderParameters, Renderer, resolve } from "./interfaces";

export class Basic implements Renderer {
    render(guessResult: CharResult[], parameters?: RenderParameters): Buffer {
        const params = parameters || new RenderParameters();
        const images: UltimateTextToImage[] = [];
        guessResult.forEach((result) => {
            const backgroundColor = resolve(result.result, params.colors);
            images.push(
                new UltimateTextToImage(result.character, {
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
