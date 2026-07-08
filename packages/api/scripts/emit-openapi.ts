import { OpenApi } from "@effect/platform";
import { Api } from "@mamen/shared/contract";

// `OpenApi.fromApi` is pure and synchronous — no runtime or handlers needed.
// Emits a stable, committable spec (see the stack survey, OpenAPI section).
const spec = OpenApi.fromApi(Api);
const out = new URL("../openapi.json", import.meta.url).pathname;
await Bun.write(out, `${JSON.stringify(spec, null, 2)}\n`);
console.log(`Wrote ${out}`);
