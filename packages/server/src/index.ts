import { join } from "node:path";
import { buildApp } from "./app";

const PORT = Number(process.env.PORT) || 3000;
const IS_DEV = process.env.NODE_ENV !== "production";
const STATIC_DIR = join(import.meta.dir, "../../web/dist");

const app = buildApp({ staticDir: IS_DEV ? undefined : STATIC_DIR });
app.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
	if (err) {
		console.error(err);
		process.exit(1);
	}
	console.log(`@mamen/server listening on ${address}`);
});
