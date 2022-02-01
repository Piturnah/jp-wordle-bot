import { Renderer, CharState, RenderParameters, resolve } from "./interfaces";

import { UltimateTextToImage, HorizontalImage } from "ultimate-text-to-image";

export class Basic implements Renderer {
    render(
        word: string,
        guessResult: CharState[],
        parameters?: RenderParameters,
    ): Buffer {
        const effectiveParameters = parameters || new RenderParameters();
        const images: UltimateTextToImage[] = [];
        [...word].forEach((character, index) => {
            const backgroundColor = resolve(
                guessResult[index],
                effectiveParameters.colors,
            );
            images.push(
                new UltimateTextToImage(character, {
                    valign: "bottom",
                    align: "center",
                    marginBottom: effectiveParameters.dimensions.marginBottom,
                    width: effectiveParameters.dimensions.imageSize,
                    height: effectiveParameters.dimensions.imageSize,
                    backgroundColor: backgroundColor,
                    fontSize: effectiveParameters.dimensions.fontSize,
                    borderSize: effectiveParameters.dimensions.borderSize,
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
