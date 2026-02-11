import { join } from "path";
import { buildApp } from "./app";

const PORT = Number(process.env.PORT) || 3000;
const STATIC_DIR = join(import.meta.dir, "../../web/dist");

const app = buildApp({ staticDir: STATIC_DIR });
app.listen({ port: PORT, host: "0.0.0.0" }, (err, address) => {
	if (err) {
		console.error(err);
		process.exit(1);
	}
	console.log(`@mamen/server listening on ${address}`);
});
