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
					width: 50,
					height: 50,
					backgroundColor: backgroundColor,
					fontSize: 30,
				})
			);
		});
		return new HorizontalImage(images, {
			valign: "middle",
			backgroundColor: "#AAAAAA",
			margin: 0,
		})
			.render()
			.toBuffer();
	}
}
