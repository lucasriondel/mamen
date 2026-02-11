import { describe, expect, it } from "vitest";
import {
	autoDetectColumns,
	detectDateFormat,
	isDebitDirection,
	isDirectionValue,
	parseAmount,
	parseDate,
} from "./parser";

describe("autoDetectColumns", () => {
	it("detects common English column headers", () => {
		const headers = ["Date", "Description", "Amount"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.dateColumn).toBe("Date");
		expect(mapping.descriptionColumns).toEqual(["Description"]);
		expect(mapping.amountColumn).toBe("Amount");
	});

	it("detects headers with different casing", () => {
		const headers = ["TRANSACTION DATE", "MERCHANT", "DEBIT"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.dateColumn).toBe("TRANSACTION DATE");
		expect(mapping.descriptionColumns).toEqual(["MERCHANT"]);
		expect(mapping.amountColumn).toBe("DEBIT");
	});

	it("detects partial matches", () => {
		const headers = ["Posted Date", "Payee Name", "Value"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.dateColumn).toBe("Posted Date");
		expect(mapping.descriptionColumns).toEqual(["Payee Name"]);
		expect(mapping.amountColumn).toBe("Value");
	});

	it("returns partial mapping when not all columns match", () => {
		const headers = ["Date", "Foo", "Bar"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.dateColumn).toBe("Date");
		expect(mapping.descriptionColumns).toBeUndefined();
		expect(mapping.amountColumn).toBeUndefined();
	});

	it("returns empty mapping for unrecognized headers", () => {
		const headers = ["Col A", "Col B", "Col C"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.dateColumn).toBeUndefined();
		expect(mapping.descriptionColumns).toBeUndefined();
		expect(mapping.amountColumn).toBeUndefined();
	});
});

describe("detectDateFormat", () => {
	it("detects YYYY-MM-DD format", () => {
		const dates = ["2024-01-15", "2024-02-20", "2024-03-10"];
		expect(detectDateFormat(dates)).toBe("YYYY-MM-DD");
	});

	it("detects DD/MM/YYYY format", () => {
		const dates = ["15/01/2024", "20/02/2024", "10/03/2024"];
		expect(detectDateFormat(dates)).toBe("DD/MM/YYYY");
	});

	it("detects DD-MM-YYYY format", () => {
		const dates = ["15-01-2024", "20-02-2024", "10-03-2024"];
		expect(detectDateFormat(dates)).toBe("DD-MM-YYYY");
	});

	it("detects DD.MM.YYYY format", () => {
		const dates = ["15.01.2024", "20.02.2024", "10.03.2024"];
		expect(detectDateFormat(dates)).toBe("DD.MM.YYYY");
	});

	it("returns auto for ambiguous formats", () => {
		const dates = ["01/02/2024", "03/04/2024"];
		// Could be DD/MM or MM/DD - but DD/MM parses validly, so it detects that
		const result = detectDateFormat(dates);
		expect(result).toBe("DD/MM/YYYY");
	});

	it("returns auto for unrecognized formats", () => {
		const dates = ["January 15 2024", "February 20 2024"];
		expect(detectDateFormat(dates)).toBe("auto");
	});

	it("detects ISO 8601 datetime with timezone", () => {
		const dates = [
			"2026-01-01T18:00:22.000Z",
			"2026-01-02T09:28:55.000Z",
			"2026-01-03T12:57:19.000Z",
		];
		expect(detectDateFormat(dates)).toBe("ISO-8601");
	});

	it("detects ISO 8601 datetime without milliseconds", () => {
		const dates = ["2026-01-01T18:00:22Z", "2026-01-02T09:28:55Z"];
		expect(detectDateFormat(dates)).toBe("ISO-8601");
	});

	it("detects ISO 8601 datetime with offset", () => {
		const dates = ["2026-01-01T18:00:22+01:00", "2026-01-02T09:28:55+01:00"];
		expect(detectDateFormat(dates)).toBe("ISO-8601");
	});

	it("prefers ISO-8601 over YYYY-MM-DD when timestamps present", () => {
		const dates = ["2026-01-01T00:00:00.000Z", "2026-02-01T00:00:00.000Z"];
		expect(detectDateFormat(dates)).toBe("ISO-8601");
	});
});

describe("parseDate", () => {
	it("parses YYYY-MM-DD", () => {
		const date = parseDate("2024-01-15", "YYYY-MM-DD");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2024);
		expect(date?.getMonth()).toBe(0);
		expect(date?.getDate()).toBe(15);
	});

	it("parses DD/MM/YYYY", () => {
		const date = parseDate("15/01/2024", "DD/MM/YYYY");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2024);
		expect(date?.getMonth()).toBe(0);
		expect(date?.getDate()).toBe(15);
	});

	it("parses MM/DD/YYYY", () => {
		const date = parseDate("01/15/2024", "MM/DD/YYYY");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2024);
		expect(date?.getMonth()).toBe(0);
		expect(date?.getDate()).toBe(15);
	});

	it("parses DD-MM-YYYY", () => {
		const date = parseDate("15-01-2024", "DD-MM-YYYY");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2024);
		expect(date?.getMonth()).toBe(0);
		expect(date?.getDate()).toBe(15);
	});

	it("parses MM-DD-YYYY", () => {
		const date = parseDate("01-15-2024", "MM-DD-YYYY");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2024);
		expect(date?.getMonth()).toBe(0);
		expect(date?.getDate()).toBe(15);
	});

	it("parses DD.MM.YYYY", () => {
		const date = parseDate("15.01.2024", "DD.MM.YYYY");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2024);
		expect(date?.getMonth()).toBe(0);
		expect(date?.getDate()).toBe(15);
	});

	it("auto-detects ISO format", () => {
		const date = parseDate("2024-01-15", "auto");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2024);
	});

	it("parses ISO 8601 datetime with timezone", () => {
		const date = parseDate("2026-01-01T18:00:22.000Z", "ISO-8601");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2026);
		expect(date?.getMonth()).toBe(0);
		expect(date?.getDate()).toBeGreaterThanOrEqual(1); // may be 1 or 2 depending on timezone
	});

	it("parses ISO 8601 datetime in auto mode", () => {
		const date = parseDate("2026-01-15T09:30:00.000Z", "auto");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2026);
		expect(date?.getMonth()).toBe(0);
	});

	it("returns null for invalid ISO-8601 values", () => {
		expect(parseDate("not-a-date", "ISO-8601")).toBeNull();
	});

	it("returns null for invalid dates", () => {
		expect(parseDate("32/01/2024", "DD/MM/YYYY")).toBeNull();
		expect(parseDate("", "YYYY-MM-DD")).toBeNull();
	});

	it("trims whitespace from values", () => {
		const date = parseDate("  2024-01-15  ", "YYYY-MM-DD");
		expect(date).not.toBeNull();
		expect(date?.getFullYear()).toBe(2024);
	});
});

describe("parseAmount", () => {
	it("parses simple positive amount", () => {
		expect(parseAmount("50.00")).toBe(50);
	});

	it("parses simple negative amount", () => {
		expect(parseAmount("-50.00")).toBe(-50);
	});

	it("parses US format with commas", () => {
		expect(parseAmount("1,234.56")).toBe(1234.56);
	});

	it("parses European format with dots and comma", () => {
		expect(parseAmount("1.234,56")).toBe(1234.56);
	});

	it("parses parentheses as negative", () => {
		expect(parseAmount("(50.00)")).toBe(-50);
	});

	it("strips currency symbols", () => {
		expect(parseAmount("$50.00")).toBe(50);
		expect(parseAmount("€50,00")).toBe(50);
		expect(parseAmount("£50.00")).toBe(50);
	});

	it("handles whitespace", () => {
		expect(parseAmount("  50.00  ")).toBe(50);
	});

	it("returns null for empty strings", () => {
		expect(parseAmount("")).toBeNull();
		expect(parseAmount("   ")).toBeNull();
	});

	it("returns null for non-numeric values", () => {
		expect(parseAmount("abc")).toBeNull();
	});

	it("parses amounts without decimals", () => {
		expect(parseAmount("50")).toBe(50);
	});

	it("handles negative European format", () => {
		expect(parseAmount("-1.234,56")).toBe(-1234.56);
	});
});

describe("autoDetectColumns with French headers", () => {
	it("detects French column headers (Montant, Intitulé)", () => {
		const headers = ["Date", "Montant", "Intitulé", "Direction"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.dateColumn).toBe("Date");
		expect(mapping.amountColumn).toBe("Montant");
		expect(mapping.descriptionColumns).toEqual(["Intitulé"]);
		expect(mapping.directionColumn).toBe("Direction");
	});

	it("detects French headers with different casing", () => {
		const headers = ["DATE", "MONTANT", "INTITULÉ", "DIRECTION"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.dateColumn).toBe("DATE");
		expect(mapping.amountColumn).toBe("MONTANT");
		expect(mapping.descriptionColumns).toEqual(["INTITULÉ"]);
		expect(mapping.directionColumn).toBe("DIRECTION");
	});

	it("detects Libellé as description column", () => {
		const headers = ["Date", "Montant", "Libellé"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.descriptionColumns).toEqual(["Libellé"]);
	});

	it("detects French headers without accents (intitule, libelle)", () => {
		const headers = ["Date", "Montant", "Intitule"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.descriptionColumns).toEqual(["Intitule"]);
	});

	it("detects Green-Got CSV headers", () => {
		const headers = [
			"N° transaction",
			"Statut",
			"Date",
			"Montant",
			"Arrondi",
			"Direction",
			"Devise",
			"IBAN du compte",
			"Intitulé",
			"IBAN du tiers",
			"Moyen de paiement",
			"Catégorie",
			"Référence",
		];
		const mapping = autoDetectColumns(headers);
		expect(mapping.dateColumn).toBe("Date");
		expect(mapping.amountColumn).toBe("Montant");
		expect(mapping.descriptionColumns).toEqual(["Intitulé"]);
		expect(mapping.directionColumn).toBe("Direction");
	});

	it("detects date d'opération as date column", () => {
		const headers = ["Date d'opération", "Montant", "Libellé"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.dateColumn).toBe("Date d'opération");
	});
});

describe("autoDetectColumns with direction", () => {
	it("detects Direction header by name", () => {
		const headers = ["Date", "Amount", "Description", "Direction"];
		const mapping = autoDetectColumns(headers);
		expect(mapping.directionColumn).toBe("Direction");
	});

	it("detects direction column by value analysis", () => {
		const headers = ["Date", "Montant", "Intitulé", "Type"];
		const rows = [
			["2026-01-01", "50", "Grocery Store", "DEBIT"],
			["2026-01-02", "100", "Salary", "CREDIT"],
		];
		const mapping = autoDetectColumns(headers, rows);
		expect(mapping.directionColumn).toBe("Type");
	});

	it("does not detect direction column when values are not debit/credit", () => {
		const headers = ["Date", "Amount", "Description", "Status"];
		const rows = [
			["2026-01-01", "50", "Store", "COMPLETE"],
			["2026-01-02", "100", "Salary", "PENDING"],
		];
		const mapping = autoDetectColumns(headers, rows);
		expect(mapping.directionColumn).toBeUndefined();
	});

	it("does not pick already-mapped columns as direction", () => {
		const headers = ["Date", "Amount", "Description"];
		const rows = [["2026-01-01", "50", "Store"]];
		const mapping = autoDetectColumns(headers, rows);
		expect(mapping.directionColumn).toBeUndefined();
	});
});

describe("isDirectionValue", () => {
	it("recognizes debit values", () => {
		expect(isDirectionValue("DEBIT")).toBe(true);
		expect(isDirectionValue("debit")).toBe(true);
		expect(isDirectionValue("DR")).toBe(true);
		expect(isDirectionValue("withdrawal")).toBe(true);
	});

	it("recognizes credit values", () => {
		expect(isDirectionValue("CREDIT")).toBe(true);
		expect(isDirectionValue("credit")).toBe(true);
		expect(isDirectionValue("CR")).toBe(true);
		expect(isDirectionValue("deposit")).toBe(true);
	});

	it("recognizes French direction values", () => {
		expect(isDirectionValue("DÉBIT")).toBe(true);
		expect(isDirectionValue("débit")).toBe(true);
		expect(isDirectionValue("CRÉDIT")).toBe(true);
		expect(isDirectionValue("crédit")).toBe(true);
	});

	it("rejects non-direction values", () => {
		expect(isDirectionValue("COMPLETE")).toBe(false);
		expect(isDirectionValue("PENDING")).toBe(false);
		expect(isDirectionValue("hello")).toBe(false);
	});
});

describe("isDebitDirection", () => {
	it("returns true for debit values", () => {
		expect(isDebitDirection("DEBIT")).toBe(true);
		expect(isDebitDirection("Dr")).toBe(true);
		expect(isDebitDirection("out")).toBe(true);
	});

	it("returns true for French débit", () => {
		expect(isDebitDirection("DÉBIT")).toBe(true);
		expect(isDebitDirection("débit")).toBe(true);
	});

	it("returns false for credit values", () => {
		expect(isDebitDirection("CREDIT")).toBe(false);
		expect(isDebitDirection("Cr")).toBe(false);
		expect(isDebitDirection("in")).toBe(false);
	});

	it("returns false for French crédit", () => {
		expect(isDebitDirection("CRÉDIT")).toBe(false);
		expect(isDebitDirection("crédit")).toBe(false);
	});
});
