import { describe, expect, it } from "vitest";
import { greenGotParser } from "./green-got";
import { detectParser, getParserById, PARSERS } from "./registry";

const GREEN_GOT_HEADERS = [
	"N° transaction",
	"Statut",
	"Date",
	"Montant",
	"Arrondi",
	"Direction",
	"Devise",
	"Intitulé",
];

describe("parser registry", () => {
	it("registers the Green-Got parser", () => {
		expect(PARSERS).toContain(greenGotParser);
		expect(getParserById("green-got")).toBe(greenGotParser);
	});

	it("auto-detects Green-Got by its header fingerprint", () => {
		expect(detectParser(GREEN_GOT_HEADERS)).toBe(greenGotParser);
	});

	it("returns null on zero matches so the user picks manually", () => {
		expect(detectParser(["Date", "Description", "Amount"])).toBeNull();
	});

	it("returns undefined for an unknown parser id", () => {
		expect(getParserById("nope")).toBeUndefined();
	});
});
