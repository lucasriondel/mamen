import { existsSync, mkdirSync, unlinkSync } from "node:fs";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";

const __dirname = dirname(fileURLToPath(import.meta.url));
export const UPLOADS_DIR = join(__dirname, "../../uploads");

export const ensureUploadsDir = (baseDir: string = UPLOADS_DIR) => {
	const merchantsDir = join(baseDir, "merchants");
	if (!existsSync(merchantsDir)) {
		mkdirSync(merchantsDir, { recursive: true });
	}
};

export const deleteUpload = (filepath: string) => {
	try {
		if (existsSync(filepath)) {
			unlinkSync(filepath);
		}
	} catch {
		// Ignore errors when deleting files
	}
};
