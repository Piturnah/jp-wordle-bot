import {
	Renderer,
	CharState,
	Colors,
	DefaultColors,
	resolve,
} from "./interfaces";

import { UltimateTextToImage, HorizontalImage } from "ultimate-text-to-image";

export class Basic implements Renderer {
	render(
		word: string,
		guessResult: CharState[],
		colors?: Colors
	): Buffer {
		const effectiveColors = colors || new DefaultColors();
		const images: UltimateTextToImage[] = [];
		[...word].forEach((character, index) => {
			const backgroundColor = resolve(
				guessResult[index],
				effectiveColors
			);
			images.push(
				new UltimateTextToImage(character, {
					valign: "bottom",
					align: "center",
					marginBottom: 12,
					width: 50,
					height: 50,
					backgroundColor: backgroundColor,
					fontSize: 40,
					borderSize: 1,
					borderColor: "#000000",
				})
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
