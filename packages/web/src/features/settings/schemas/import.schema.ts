import { z } from "zod";

export const exportMetadataSchema = z.object({
	exportDate: z.string(),
	appVersion: z.string(),
	exportFormat: z.string(),
	recordCounts: z.object({
		accounts: z.number(),
		transactions: z.number(),
		merchants: z.number(),
		rules: z.number(),
		categories: z.number(),
		subscriptions: z.number(),
		settings: z.number(),
		appSettings: z.number(),
	}),
});

export const exportDataSchema = z.object({
	metadata: exportMetadataSchema,
	accounts: z.array(z.any()),
	transactions: z.array(z.any()),
	merchants: z.array(z.any()),
	rules: z.array(z.any()),
	categories: z.array(z.any()),
	subscriptions: z.array(z.any()),
	settings: z.array(z.any()),
	appSettings: z.array(z.any()),
});
