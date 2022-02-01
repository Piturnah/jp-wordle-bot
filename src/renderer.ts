import { Renderer, CharState, RenderParameters, resolve } from "./interfaces";

import { UltimateTextToImage, HorizontalImage } from "ultimate-text-to-image";

export class Basic implements Renderer {
    render(
        word: string,
        guessResult: CharState[],
        parameters?: RenderParameters,
    ): Buffer {
        const params = parameters || new RenderParameters();
        const images: UltimateTextToImage[] = [];
        [...word].forEach((character, index) => {
            const backgroundColor = resolve(
                guessResult[index],
                params.colors,
            );
            images.push(
                new UltimateTextToImage(character, {
                    valign: "bottom",
                    align: "center",
                    marginBottom: params.dimensions.marginBottom,
                    width: params.dimensions.imageSize,
                    height: params.dimensions.imageSize,
                    backgroundColor: backgroundColor,
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
