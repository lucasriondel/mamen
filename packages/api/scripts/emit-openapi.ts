import { OpenApi } from "@effect/platform";
import { Api } from "@mamen/shared/contract";

// `OpenApi.fromApi` is pure and synchronous — no runtime or handlers needed.
// Output is deterministic (stable key order, nothing time/env-dependent), so
// the emitted spec is safe to commit and to diff-check in CI.
// See the stack survey, OpenAPI section (incl. the `fromApi` WeakMap-cache
// gotcha: one options variant per process — we only ever call it with none).
const specJson = `${JSON.stringify(OpenApi.fromApi(Api), null, 2)}\n`;
const out = new URL("../openapi.json", import.meta.url).pathname;

// `--check` = drift guard: fail (non-zero exit) if the committed spec is stale
// relative to the contract, instead of rewriting it. Wired into CI via the
// `test` turbo task so a contract change without a re-emit breaks the build.
if (process.argv.includes("--check")) {
	const committed = await Bun.file(out)
		.text()
		.catch(() => null);
	if (committed !== specJson) {
		console.error(
			committed === null
				? `OpenAPI spec missing at ${out} — run \`bun run emit-openapi\`.`
				: `OpenAPI spec at ${out} is out of sync with the contract.\n` +
						"Run `bun run emit-openapi` and commit the result.",
		);
		process.exit(1);
	}
	console.log(`OpenAPI spec is in sync (${out}).`);
} else {
	await Bun.write(out, specJson);
	console.log(`Wrote ${out}`);
}
