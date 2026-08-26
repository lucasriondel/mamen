import { existsSync, readdirSync, readFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { HttpApiBuilder, HttpApiClient } from "@effect/platform";
import { BadArgument } from "@effect/platform/Error";
import { NodeHttpServer } from "@effect/platform-node";
import { afterEach, assert, beforeEach, describe, it } from "@effect/vitest";
import {
  AccountId,
  AiProviderNotConfigured,
  Api,
  ExtractionFailed,
  InvalidFileType,
  NoTransactionTable,
  NotFound,
} from "@mamen/shared/contract";
import type { HostedGenerate } from "ai-task-runner-effect";
import type { SpawnHandler } from "claude-code-effect";
import { Effect, Layer, Schema } from "effect";
import { HostedTransport } from "../ai-runner";
import { ApiLive } from "../api-live";
import { DatabaseTest } from "../db/test";
import { OutboundStub } from "../net/test";
import { claudeCodeStoredTokenLayer, claudeCodeTestLayer } from "./test";

// The canned extraction the deep-fake `claude` returns for the CCF fixture: 6
// operations (5 Débit → negative, 1 Crédit → positive) plus the statement's
// printed `TOTAL DES OPÉRATIONS`. The debits sum to the declared 1929,71 and
// the single salary credit is the declared 1947,26 — the shape #45 reconciles.
// `missingColumns` is the model's half of the **format verdict** (issue #188):
// which of the columns the chosen format declares this statement did not carry.
// Nothing missing here — the canned answer is the CCF statement read against the
// CCF format, which is the matching case every test below but the mismatch ones
// wants.
// Each row also carries `rawSource` (issue #189): its own cells, keyed by the
// columns the format declares and written the way the statement prints them —
// which is why the archived `Débit` reads `6,99` beside a parsed `-6.99`.
const CCF_OBJECT = {
  missingColumns: [] as readonly string[],
  transactions: [
    {
      date: "2026-01-03",
      amount: -6.99,
      rawIssuerString: "CB AMAZON",
      rawSource: { Date: "03/01", Valeur: "03/01", Libellé: "CB AMAZON", Débit: "6,99" },
    },
    {
      date: "2026-01-08",
      amount: -89.9,
      rawIssuerString: "PRLV EDF ENERGIE",
      rawSource: { Date: "08/01", Valeur: "09/01", Libellé: "PRLV EDF ENERGIE", Débit: "89,90" },
    },
    {
      date: "2026-01-12",
      amount: -152.34,
      rawIssuerString: "CB CARREFOUR MARKET PARIS",
      rawSource: {
        Date: "12/01",
        Valeur: "12/01",
        Libellé: "CB CARREFOUR MARKET PARIS",
        Débit: "152,34",
      },
    },
    {
      date: "2026-01-15",
      amount: 1947.26,
      rawIssuerString: "VIR SALAIRE ACME",
      rawSource: {
        Date: "15/01",
        Valeur: "15/01",
        Libellé: "VIR SALAIRE ACME",
        Crédit: "1 947,26",
      },
    },
    {
      date: "2026-01-20",
      amount: -900,
      rawIssuerString: "VIR LOYER JANVIER",
      rawSource: { Date: "20/01", Valeur: "20/01", Libellé: "VIR LOYER JANVIER", Débit: "900,00" },
    },
    {
      date: "2026-01-27",
      amount: -780.48,
      rawIssuerString: "CB SNCF CONNECT",
      rawSource: { Date: "27/01", Valeur: "27/01", Libellé: "CB SNCF CONNECT", Débit: "780,48" },
    },
  ],
  declaredTotals: { debit: 1929.71, credit: 1947.26 },
};

/** A success envelope carrying `structured_output` — the object read path. */
const okEnvelope = (object: unknown): string =>
  JSON.stringify({
    is_error: false,
    structured_output: object,
    result: JSON.stringify(object),
    session_id: "sess-ccf",
    modelUsage: { "claude-opus-4": {} },
    usage: { input_tokens: 10, output_tokens: 20 },
    total_cost_usd: 0.02,
  });

/** Build the full HTTP stack with a canned extraction handler wired in. */
const httpLiveWith = (handler: SpawnHandler) =>
  HttpApiBuilder.serve().pipe(
    Layer.provide(ApiLive),
    Layer.provide(claudeCodeTestLayer(handler)),
    Layer.provide(OutboundStub),
    Layer.provide(DatabaseTest),
    Layer.provideMerge(NodeHttpServer.layerTest),
  );

/** The Anthropic key these tests paste. Long enough for the store to accept. */
const ANTHROPIC_KEY = "sk-ant-api03-Kj28fnQ2xLmPqR7v-3f9";

/** The other two vendors' keys, in each vendor's own shape. */
const GOOGLE_KEY = "AIzaSyB-Qw3xTn7Lp0aa11bb22cc33dd44ee";
const OPENAI_KEY = "sk-proj-7Hq2Rf8pLxNv0kTz-Ww4";

/**
 * The same stack with the hosted transport faked (issue #124) — the one new
 * seam, and the only thing about a hosted run these tests stand in for. The CLI
 * handler stays real and answers with the canned envelope by default, so "the
 * CLI was not used" is a claim about a transport that was there.
 */
const httpLiveWithHosted = (
  generate: HostedGenerate,
  handler: SpawnHandler = () =>
    Effect.succeed({
      stdout: okEnvelope(CCF_OBJECT),
      stderr: "",
      exitCode: 0,
    }),
) => httpLiveWith(handler).pipe(Layer.provide(Layer.succeed(HostedTransport, generate)));

/** Every call the hosted seam saw, and a fake that answers with `respond`. */
const hostedRecorder = (respond: () => Promise<unknown>) => {
  const calls: Array<Parameters<HostedGenerate>[0]> = [];
  const generate: HostedGenerate = (args) => {
    calls.push(args);
    return respond();
  };
  return { calls, generate };
};

/** The staging dirs already in the temp root — the snapshot `stagedDirOf` skips. */
const stagedDirsBefore = (): ReadonlySet<string> =>
  new Set(readdirSync(tmpdir()).filter((name) => name.startsWith("mamen-pdf-")));

/**
 * The transient temp dir this request staged its statement in, found by its
 * contents.
 *
 * The hosted turn deliberately carries no path — that is the whole point of the
 * second prompt column — so the dir cannot be read off the call the way
 * {@link stagedIn} reads it off the CLI's `--add-dir`. Matching on the uploaded
 * bytes instead identifies *this* request's dir unambiguously, even with another
 * extraction in flight in a parallel test file.
 *
 * `before` is what makes that true a second time: a run killed mid-flight leaves
 * a dir behind, and a *deletion* test that found the corpse of an earlier run
 * would fail for a reason that has nothing to do with the code under test. Only
 * dirs that appeared after the snapshot count.
 */
const stagedDirOf = (marker: Uint8Array, before: ReadonlySet<string>): string => {
  const root = tmpdir();
  for (const name of readdirSync(root)) {
    if (!name.startsWith("mamen-pdf-") || before.has(name)) continue;
    const file = join(root, name, "statement.pdf");
    if (existsSync(file) && Buffer.from(readFileSync(file)).equals(marker)) {
      return join(root, name);
    }
  }
  return "";
};

/**
 * The same stack, but with the CLI's token read from the **encrypted store**,
 * per call — the production config (issue #122). Everything above uses a pinned
 * dummy token, because the token is not their subject; these tests' subject is
 * exactly that read.
 */
const httpLiveWithStoredToken = (handler: SpawnHandler) =>
  HttpApiBuilder.serve().pipe(
    Layer.provide(ApiLive),
    Layer.provide(claudeCodeStoredTokenLayer(handler)),
    Layer.provide(OutboundStub),
    Layer.provide(DatabaseTest),
    Layer.provideMerge(NodeHttpServer.layerTest),
  );

/** The four bytes every upload here carries unless a test wants its own. */
const PDF_MAGIC = Uint8Array.from([0x25, 0x50, 0x44, 0x46]);

/**
 * The columns the account's stored PDF **Statement Format** declares — the CCF
 * statement's own layout.
 *
 * Since issue #185 an extraction is always run *against* a format, so every
 * upload below carries one: the endpoint is no longer account-agnostic, and a
 * file with no format named is a request it cannot build a prompt for.
 */
const CCF_COLUMNS = ["Date", "Valeur", "Libellé", "Débit", "Crédit"];

/**
 * A PDF upload: the statement under `file`, and under `formatId` the id of the
 * **Statement Format** the user chose for it.
 *
 * The id rather than the record. What the columns are is the account's stored
 * answer, so the server reads it back rather than believing a client that could
 * name any columns it liked for a format it does not own.
 */
const pdfFormData = (
  formatId: number | string,
  mime = "application/pdf",
  filename = "RLV_CHQ1_LUCAS_RIO_001.pdf",
  bytes: Uint8Array<ArrayBuffer> = PDF_MAGIC,
): FormData => {
  const fd = new FormData();
  fd.append("file", new File([bytes], filename, { type: mime }));
  fd.append("formatId", String(formatId));
  return fd;
};

/**
 * A **discovery** upload (issue #217): the file, and **nothing else**. No
 * `formatId`, because there is no format — that is the dead end that operation
 * exists to open.
 */
const statementFormData = (
  mime = "application/pdf",
  bytes: Uint8Array<ArrayBuffer> = PDF_MAGIC,
): FormData => {
  const fd = new FormData();
  fd.append("file", new File([bytes], "RLV_CHQ1_LUCAS_RIO_001.pdf", { type: mime }));
  return fd;
};

/** A PDF **Statement Format** for the account, stored the way the wizard will. */
const storePdfFormat = (columns: readonly string[] = CCF_COLUMNS) =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(Api);
    const format = yield* client.statementFormats.create({
      payload: {
        accountId: Schema.decodeSync(AccountId)(1),
        name: "CCF — relevé de compte",
        kind: "pdf",
        columns,
        mapping: { date: "Date", rawIssuerString: ["Libellé"], counterpartyIban: null },
        rules: {
          sign: {
            strategy: "debit-credit-columns",
            debitColumn: "Débit",
            creditColumn: "Crédit",
          },
          dateOrder: "day-first",
          decimalSeparator: "comma",
          filter: null,
        },
      },
    });
    return format.id;
  });

/**
 * The upload every test below sends: a freshly stored PDF format, and a
 * multipart body naming it. One helper rather than a fixture id, because the
 * database is `:memory:` and fresh per test — the format has to be *put there*
 * by the same endpoints a user would.
 */
const pdfUpload = (
  options: {
    readonly mime?: string;
    readonly filename?: string;
    readonly bytes?: Uint8Array<ArrayBuffer>;
    readonly columns?: readonly string[];
  } = {},
) =>
  Effect.gen(function* () {
    const formatId = yield* storePdfFormat(options.columns);
    return pdfFormData(formatId, options.mime, options.filename, options.bytes);
  });

/** The dir the CLI was scoped to — i.e. where the statement was staged. */
const stagedIn = (args: ReadonlyArray<string>): string => {
  const dir = args[args.indexOf("--add-dir") + 1];
  assert.match(dir, /mamen-pdf-/);
  return dir;
};

/**
 * Store `key` for `provider` and move extraction onto it — through the same
 * two endpoints the settings page uses, so every hosted state under test is
 * one a user could actually have reached. `model` omitted leaves the task on
 * that provider's default.
 */
const chooseHosted = (provider: "anthropic" | "google" | "openai", key: string, model?: string) =>
  Effect.gen(function* () {
    const client = yield* HttpApiClient.make(Api);
    yield* client.secrets.put({
      path: { name: provider },
      payload: { value: key },
    });
    yield* client.aiTasks.patch({
      payload: {
        tasks: [{ task: "extract-pdf", provider, ...(model ? { model } : {}) }],
      },
    });
  });

/**
 * A captured vendor request's JSON body. Typed on the one field it reads rather
 * than on `VendorRequest`, which is declared inside the suite that captures
 * them — this only ever needs the body.
 */
const bodyOf = (request: { readonly body: string }): Record<string, unknown> =>
  JSON.parse(request.body) as Record<string, unknown>;

describe("import endpoints", () => {
  it.effect("extractPdf returns the candidate transactions + declared totals", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const result = yield* client.import.extractPdf({
        payload: yield* pdfUpload(),
      });

      // Re-decoded through the ExtractedTransaction schema: dates are Dates,
      // amounts keep their sign (Débit negative, Crédit positive).
      assert.strictEqual(result.transactions.length, 6);
      assert.strictEqual(result.transactions[0].rawIssuerString, "CB AMAZON");
      assert.strictEqual(result.transactions[0].amount, -6.99);
      assert.ok(result.transactions[0].date instanceof Date);
      assert.strictEqual(result.transactions[0].date.toISOString().slice(0, 10), "2026-01-03");

      // The one credit stays positive.
      const credit = result.transactions.find((t) => t.amount > 0);
      assert.ok(credit);
      assert.strictEqual(credit?.amount, 1947.26);

      // declaredTotals mirrors the statement's printed TOTAL DES OPÉRATIONS.
      assert.deepStrictEqual(result.declaredTotals, {
        debit: 1929.71,
        credit: 1947.26,
      });
    }).pipe(
      Effect.provide(
        httpLiveWith(() =>
          Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          }),
        ),
      ),
    ),
  );

  it.effect("extractPdf drives the claude CLI read-only, scoped to the temp dir", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.import.extractPdf({ payload: yield* pdfUpload() });
    }).pipe(
      Effect.provide(
        httpLiveWith((input) => {
          // Read-only: only the Read tool is allowed, scoped by --add-dir, and
          // the prompt (stdin) names the staged statement.pdf.
          assert.ok(input.args.includes("--allowedTools"));
          assert.ok(input.args.includes("Read"));
          assert.ok(input.args.includes("--add-dir"));
          assert.ok(input.stdin.includes("statement.pdf"));
          return Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    ),
  );

  /**
   * Issue #185 — the endpoint takes the chosen **Statement Format** alongside
   * the file, and the format's declared columns are what the model is told the
   * statement carries. This is the payload change, asserted where it lands: on
   * the prompt the CLI is actually handed.
   */
  it.effect("extractPdf tells the model the columns the chosen format declares", () => {
    let prompt = "";
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      // A second PDF format on the same account, so "the columns reached the
      // prompt" is a claim about the one the request named rather than about
      // every format stored.
      yield* storePdfFormat(["Jour", "Opération", "Montant réglé"]);

      yield* client.import.extractPdf({
        payload: yield* pdfUpload({ columns: ["Date", "Opération", "Retrait", "Dépôt"] }),
      });

      for (const column of ["Date", "Opération", "Retrait", "Dépôt"]) {
        assert.include(prompt, `"${column}"`);
      }
      assert.notInclude(prompt, "Montant réglé");
    }).pipe(
      Effect.provide(
        httpLiveWith((input) => {
          prompt = input.stdin;
          return Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    );
  });

  /**
   * Issue #188 — the result carries a **format verdict**: whether the statement
   * matched the **Statement Format** it was read against, and which expected
   * columns it was missing.
   *
   * Both verdicts are driven from the same stub, because the difference between
   * them is one field of the model's answer and the whole point is that the
   * endpoint turns that field into something the wizard can branch on.
   */
  describe("the format verdict", () => {
    /** The canned CCF answer, with the model reporting these columns missing. */
    const reporting =
      (missingColumns: readonly string[]): SpawnHandler =>
      () =>
        Effect.succeed({
          stdout: okEnvelope({ ...CCF_OBJECT, missingColumns }),
          stderr: "",
          exitCode: 0,
        });

    it.effect("matches when the statement carries every column the format declares", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const result = yield* client.import.extractPdf({ payload: yield* pdfUpload() });

        assert.isTrue(result.verdict.matched);
        assert.deepStrictEqual([...result.verdict.missingColumns], []);
      }).pipe(Effect.provide(httpLiveWith(reporting([])))),
    );

    // The rows still come back. The endpoint *reports* the mismatch; what to do
    // about a wrong format is the wizard's branch, not a refusal here — and a
    // 502 would tell the user extraction failed, which is not what happened.
    it.effect("reports the expected columns the statement was missing, and the rows too", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const result = yield* client.import.extractPdf({ payload: yield* pdfUpload() });

        assert.isFalse(result.verdict.matched);
        assert.deepStrictEqual([...result.verdict.missingColumns], ["Débit", "Crédit"]);
        assert.strictEqual(result.transactions.length, 6);
      }).pipe(Effect.provide(httpLiveWith(reporting(["Débit", "Crédit"])))),
    );

    /**
     * The verdict reports on the **expected** columns — the ones the user's own
     * format declares. A name from anywhere else is not one of them, so it is
     * dropped rather than shown: putting a column the format never mentioned in
     * front of the user would send them looking for a mapping they cannot have
     * got wrong, and would fail a format that is in fact correct.
     */
    it.effect("never names a column the chosen format does not declare", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const result = yield* client.import.extractPdf({ payload: yield* pdfUpload() });

        assert.deepStrictEqual([...result.verdict.missingColumns], ["Débit"]);
      }).pipe(Effect.provide(httpLiveWith(reporting(["Solde", "Débit"])))),
    );

    // Case and surrounding space are how a model writes a name, not what the
    // name is. A format that is right about the statement must not be failed
    // over a capital letter — and what comes back is the *format's* spelling,
    // since that is the word the user typed and will go looking for.
    it.effect("reads a differently-spelled column as the one the format declares", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const result = yield* client.import.extractPdf({ payload: yield* pdfUpload() });

        assert.isFalse(result.verdict.matched);
        assert.deepStrictEqual([...result.verdict.missingColumns], ["Débit"]);
      }).pipe(Effect.provide(httpLiveWith(reporting([" DÉBIT "])))),
    );

    // A format may declare no columns at all, and then there is nothing to miss:
    // the verdict is a match, whatever the model chose to say.
    it.effect("matches a format that declares no columns", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const result = yield* client.import.extractPdf({
          payload: yield* pdfUpload({ columns: [] }),
        });

        assert.isTrue(result.verdict.matched);
        assert.deepStrictEqual([...result.verdict.missingColumns], []);
      }).pipe(Effect.provide(httpLiveWith(reporting(["Débit"])))),
    );
  });

  /**
   * Issue #189 — a PDF-extracted row carries a **raw source**, populated from
   * the table the model returned.
   *
   * This is the extraction seam of the claim: what the endpoint answers with is
   * what the wizard threads into `TransactionCreate.rawSource`, so a row's
   * archive either survives this boundary or does not exist. Issue #175 excluded
   * PDF rows for want of an original row; the declared columns (#185) are what
   * make a returned table into one.
   */
  describe("the row's raw source", () => {
    /** The canned CCF answer, with these rows' archives replaced. */
    const archiving =
      (rawSources: ReadonlyArray<Record<string, string>>): SpawnHandler =>
      () =>
        Effect.succeed({
          stdout: okEnvelope({
            ...CCF_OBJECT,
            transactions: CCF_OBJECT.transactions
              .slice(0, rawSources.length)
              .map((tx, index) => ({ ...tx, rawSource: rawSources[index] })),
          }),
          stderr: "",
          exitCode: 0,
        });

    // Keys in the statement's own words, values as printed — so the archived
    // `Débit` still reads `6,99` beside an `amount` of `-6.99`. That
    // disagreement is the division of labour ADR 0012 records: the fields are
    // for arithmetic, the archive is for provenance.
    it.effect("comes back on each row, in the statement's own words", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const result = yield* client.import.extractPdf({ payload: yield* pdfUpload() });

        assert.deepStrictEqual(
          { ...result.transactions[0].rawSource },
          {
            Date: "03/01",
            Valeur: "03/01",
            Libellé: "CB AMAZON",
            Débit: "6,99",
          },
        );
        assert.strictEqual(result.transactions[0].amount, -6.99);
        assert.deepStrictEqual(
          { ...result.transactions[3].rawSource },
          {
            Date: "15/01",
            Valeur: "15/01",
            Libellé: "VIR SALAIRE ACME",
            Crédit: "1 947,26",
          },
        );
      }).pipe(
        Effect.provide(
          httpLiveWith(() =>
            Effect.succeed({
              stdout: okEnvelope(CCF_OBJECT),
              stderr: "",
              exitCode: 0,
            }),
          ),
        ),
      ),
    );

    /**
     * A row with nothing to archive carries **no** raw source rather than an
     * empty one. The detail page renders the archive as a block of the bank's
     * own words, and an empty block reads as a broken page rather than as "the
     * statement said nothing" (issue #175's story 11). The model is required to
     * answer, so `{}` is what "nothing" looks like on the way in; folding it to
     * absent here is the endpoint's job, the same way the **format verdict** is.
     */
    it.effect("is absent, not empty, on a row that archives nothing", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const result = yield* client.import.extractPdf({ payload: yield* pdfUpload() });

        assert.notProperty(result.transactions[0], "rawSource");
        // The row beside it is untouched: the fold is per row, not per answer.
        assert.deepStrictEqual({ ...result.transactions[1].rawSource }, { Libellé: "PRLV EDF" });
      }).pipe(Effect.provide(httpLiveWith(archiving([{}, { Libellé: "PRLV EDF" }])))),
    );

    /**
     * The archive is required of the model. An answer omitting it is not an
     * answer to the question, and defaulting it to empty would fold a silence
     * into "this row had nothing to keep" — the very premise this ticket makes
     * false. It fails the way every other unusable answer does: opaque, 502, and
     * retryable.
     */
    it.effect("fails the run when the model archives nothing at all", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const error = yield* client.import
          .extractPdf({ payload: yield* pdfUpload() })
          .pipe(Effect.flip);

        assert.ok(error instanceof ExtractionFailed);
      }).pipe(
        Effect.provide(
          httpLiveWith(() =>
            Effect.succeed({
              stdout: okEnvelope({
                ...CCF_OBJECT,
                transactions: [{ date: "2026-01-03", amount: -6.99, rawIssuerString: "CB AMAZON" }],
              }),
              stderr: "",
              exitCode: 0,
            }),
          ),
        ),
      ),
    );
  });

  /**
   * Issue #196 (PRD #190) — **declared totals are optional**, because not every
   * statement prints them. A Trade Republic statement carries no
   * `TOTAL DES OPÉRATIONS` line; the model says so with `null` and the endpoint
   * answers with the field absent, so the client's **reconciliation check** skips
   * rather than reconciling the rows against an assumed zero.
   */
  describe("the declared totals", () => {
    /** The same statement, its totals line reported as the model saw it. */
    const totalling =
      (declaredTotals: unknown): SpawnHandler =>
      () =>
        Effect.succeed({
          stdout: okEnvelope({ ...CCF_OBJECT, declaredTotals }),
          stderr: "",
          exitCode: 0,
        });

    // Absent, not zeroed: a zero pair is what a statement with no debits
    // *declares*, and the client is entitled to reconcile against it.
    it.effect("is absent when the statement printed no totals line", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const result = yield* client.import.extractPdf({ payload: yield* pdfUpload() });

        assert.notProperty(result, "declaredTotals");
        // The rows are untouched — nothing about the statement's arithmetic
        // changes what the model read off it.
        assert.strictEqual(result.transactions.length, 6);
      }).pipe(Effect.provide(httpLiveWith(totalling(null)))),
    );

    it.effect("keeps a declared zero, which is a total the statement printed", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const result = yield* client.import.extractPdf({ payload: yield* pdfUpload() });

        assert.deepStrictEqual(result.declaredTotals, { debit: 0, credit: 0 });
      }).pipe(Effect.provide(httpLiveWith(totalling({ debit: 0, credit: 0 })))),
    );

    // Required of the model, like the row archive and the missing columns: a
    // silence is not an answer to "does this statement print totals?".
    it.effect("fails the run when the model says nothing about them", () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const error = yield* client.import
          .extractPdf({ payload: yield* pdfUpload() })
          .pipe(Effect.flip);

        assert.ok(error instanceof ExtractionFailed);
      }).pipe(
        Effect.provide(
          httpLiveWith(() =>
            Effect.succeed({
              stdout: okEnvelope({
                transactions: CCF_OBJECT.transactions,
                missingColumns: [],
              }),
              stderr: "",
              exitCode: 0,
            }),
          ),
        ),
      ),
    );
  });

  // The columns are the account's stored answer, so a format id that names no
  // row is a 404 and not an extraction run on a guessed layout. The statement is
  // never sent anywhere: the lookup fails before a provider is reached.
  it.effect("extractPdf 404s on a format id that names nothing, without extracting", () => {
    let spawned = false;
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .extractPdf({ payload: pdfFormData(9999) })
        .pipe(Effect.flip);

      assert.ok(error instanceof NotFound);
      assert.strictEqual(error.id, 9999);
      assert.isFalse(spawned);
    }).pipe(
      Effect.provide(
        httpLiveWith(() => {
          spawned = true;
          return Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    );
  });

  /**
   * A CSV format is not a PDF format that happens to be stored elsewhere: it
   * declares the headers that *fingerprint* a file, which is a different thing
   * from the columns to ask a model for. Applying one here would put a
   * fingerprint into the prompt as though it were the statement's layout, so the
   * lookup refuses it — there is no PDF format under that id.
   */
  it.effect("extractPdf refuses a CSV format's id", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const csv = yield* client.statementFormats.create({
        payload: {
          accountId: Schema.decodeSync(AccountId)(1),
          name: "Green-Got",
          kind: "csv",
          headers: ["Statut", "Date", "Montant", "Direction", "Intitulé"],
          mapping: { date: "Date", rawIssuerString: ["Intitulé"], counterpartyIban: null },
          rules: {
            sign: {
              strategy: "direction-column",
              amountColumn: "Montant",
              directionColumn: "Direction",
              debitValue: "DEBIT",
            },
            dateOrder: "iso",
            decimalSeparator: "dot",
            filter: null,
          },
        },
      });

      const error = yield* client.import
        .extractPdf({ payload: pdfFormData(csv.id) })
        .pipe(Effect.flip);

      assert.ok(error instanceof NotFound);
      assert.strictEqual(error.id, csv.id);
    }).pipe(
      Effect.provide(
        httpLiveWith(() =>
          Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          }),
        ),
      ),
    ),
  );

  it.effect("extractPdf rejects a non-PDF upload with InvalidFileType (415)", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .extractPdf({ payload: yield* pdfUpload({ mime: "image/png", filename: "not-a.pdf" }) })
        .pipe(Effect.flip);

      assert.ok(error instanceof InvalidFileType);
      assert.strictEqual(error.received, "image/png");
      assert.deepStrictEqual([...error.allowed], ["application/pdf"]);
    }).pipe(
      Effect.provide(
        httpLiveWith(() =>
          Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          }),
        ),
      ),
    ),
  );

  // Every claude-code-effect failure tag collapses to one client-visible
  // ExtractionFailed. A spawn failure (child never launched) stands in here.
  it.effect("extractPdf collapses a spawn failure to ExtractionFailed (502)", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .extractPdf({ payload: yield* pdfUpload() })
        .pipe(Effect.flip);

      assert.ok(error instanceof ExtractionFailed);
    }).pipe(
      Effect.provide(
        httpLiveWith(() =>
          Effect.fail(
            new BadArgument({
              module: "Command",
              method: "start",
              description: "boom",
            }),
          ),
        ),
      ),
    ),
  );

  // An `is_error: true` envelope (quota / refusal / 4xx) is a different tag
  // (ClaudeApiError) and must collapse to the same single ExtractionFailed.
  it.effect("extractPdf collapses an API-error envelope to ExtractionFailed", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .extractPdf({ payload: yield* pdfUpload() })
        .pipe(Effect.flip);

      assert.ok(error instanceof ExtractionFailed);
    }).pipe(
      Effect.provide(
        httpLiveWith(() =>
          Effect.succeed({
            stdout: JSON.stringify({
              is_error: true,
              result: "rate limited",
              api_error_status: 429,
            }),
            stderr: "",
            exitCode: 1,
          }),
        ),
      ),
    ),
  );
});

/**
 * The **transient temp dir** (ADR 0005) survived the move onto the runner. The
 * staged copy is the sensitive artefact, so "it is gone afterwards" is asserted
 * against the filesystem rather than left to the shape of the code — and on the
 * failure path too, which is the one where a missing finalizer would show.
 */
describe("the staged PDF does not outlive the request", () => {
  it.effect("is deleted after a successful extraction", () => {
    let dir = "";
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.import.extractPdf({ payload: yield* pdfUpload() });

      assert.isFalse(existsSync(dir));
    }).pipe(
      Effect.provide(
        httpLiveWith((input) => {
          dir = stagedIn(input.args);
          // Still there while the model is reading it — otherwise the
          // assertion below would pass for the wrong reason.
          assert.isTrue(existsSync(`${dir}/statement.pdf`));
          return Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    );
  });

  it.effect("is deleted after a failed extraction too", () => {
    let dir = "";
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.import.extractPdf({ payload: yield* pdfUpload() }).pipe(Effect.flip);

      assert.isFalse(existsSync(dir));
    }).pipe(
      Effect.provide(
        httpLiveWith((input) => {
          dir = stagedIn(input.args);
          return Effect.fail(
            new BadArgument({
              module: "Command",
              method: "start",
              description: "boom",
            }),
          );
        }),
      ),
    );
  });
});

/**
 * Extraction now runs through `ai-task-runner-effect` (issue #121), so the
 * stored provider/model choice is what selects the transport. Nothing above this
 * point changed — that is the behaviour-preserving half. What is new is below:
 * the choice reaching the CLI, and the choice being able to send the statement
 * somewhere else.
 */
describe("extraction runs on the stored choice", () => {
  it.effect("drives the CLI on the task's resolved model", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const resolved = yield* client.aiTasks.resolve({
        path: { task: "extract-pdf" },
      });
      yield* client.import.extractPdf({ payload: yield* pdfUpload() });

      // A fresh install has chosen nothing, so this is the catalogue default —
      // the local CLI on its cheap model, asserted through the resolver rather
      // than restated, so moving the default moves both together.
      assert.strictEqual(resolved.provider, "claude-code");
      assert.strictEqual(resolved.model, "claude-haiku-4-5");
    }).pipe(
      Effect.provide(
        httpLiveWith((input) => {
          assert.ok(input.args.includes("--model"));
          assert.ok(input.args.includes("claude-haiku-4-5"));
          return Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    ),
  );

  // The whole point of the previous tickets: a saved choice has to change what
  // actually runs, not just what a settings page renders back.
  it.effect("runs on a model the user saved, not the default", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", model: "claude-opus-5" }] },
      });
      const result = yield* client.import.extractPdf({
        payload: yield* pdfUpload(),
      });

      // Same rows either way — the model is a transport choice, not a contract
      // change.
      assert.strictEqual(result.transactions.length, 6);
    }).pipe(
      Effect.provide(
        httpLiveWith((input) => {
          assert.ok(input.args.includes("claude-opus-5"));
          assert.ok(!input.args.includes("claude-haiku-4-5"));
          return Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    ),
  );
});

/**
 * The Claude Code token is a **stored credential**, not an environment variable
 * (issue #122). The API starts without one, and the run is where its absence is
 * discovered — which is only acceptable because the failure is a distinct,
 * client-actionable error rather than the opaque retry-able one.
 *
 * Every test here runs the *production* config layer against a `:memory:`
 * database, so what is asserted is the real per-call read.
 */
describe("the Claude Code token comes from the credential store", () => {
  /** A plausible `claude setup-token` OAuth token; never a real one. */
  const TOKEN = "sk-ant-oat01-3fQ2xLmPqR7v-KjnW8sd";

  beforeEach(() => {
    process.env.TOKEN_ENCRYPTION_KEY = "b".repeat(64);
  });

  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.CLAUDE_CODE_OAUTH_TOKEN;
  });

  it.effect("fails with AiProviderNotConfigured when no token has been pasted", () => {
    let spawned = false;
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .extractPdf({ payload: yield* pdfUpload() })
        .pipe(Effect.flip);

      // Distinguishable from the generic collapse: this is the one extraction
      // failure a user can act on, and a client that could not tell it from
      // `ExtractionFailed` would offer a retry that cannot ever succeed.
      assert.ok(error instanceof AiProviderNotConfigured);
      assert.strictEqual(error.task, "extract-pdf");
      assert.strictEqual(error.provider, "claude-code");
      // The refusal arrives before a subprocess exists.
      assert.isFalse(spawned);
    }).pipe(
      Effect.provide(
        httpLiveWithStoredToken(() => {
          spawned = true;
          return Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    );
  });

  // The ticket's "no fallback", asserted from the direction it would break: a
  // token left over in a deployment's environment must not quietly keep
  // extraction working after the store became its one home.
  it.effect("does not fall back to CLAUDE_CODE_OAUTH_TOKEN", () => {
    process.env.CLAUDE_CODE_OAUTH_TOKEN = "sk-ant-oat01-from-the-environment";
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .extractPdf({ payload: yield* pdfUpload() })
        .pipe(Effect.flip);

      assert.ok(error instanceof AiProviderNotConfigured);
    }).pipe(
      Effect.provide(
        httpLiveWithStoredToken(() =>
          Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          }),
        ),
      ),
    );
  });

  // The per-call resolution, asserted as the behaviour it exists for: one
  // server, one built layer, a token pasted between two uploads. With the value
  // form the second upload would fail exactly like the first until the process
  // was restarted.
  it.effect("runs the very next extraction after the token is pasted", () => {
    let childToken: string | undefined;
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);

      const before = yield* client.import
        .extractPdf({ payload: yield* pdfUpload() })
        .pipe(Effect.flip);
      assert.ok(before instanceof AiProviderNotConfigured);

      // Pasted on the settings page like any other credential.
      const status = yield* client.secrets.put({
        path: { name: "claude-code" },
        payload: { value: TOKEN },
      });
      assert.isTrue(status.configured);
      // Outward it is a boolean and a masked hint, like every other credential
      // — the token itself does not come back.
      assert.notStrictEqual(status.hint, TOKEN);

      const result = yield* client.import.extractPdf({
        payload: yield* pdfUpload(),
      });
      assert.strictEqual(result.transactions.length, 6);
      // And it is *that* token the CLI authenticated with.
      assert.strictEqual(childToken, TOKEN);
    }).pipe(
      Effect.provide(
        httpLiveWithStoredToken((input) => {
          childToken = input.env.CLAUDE_CODE_OAUTH_TOKEN;
          return Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    );
  });

  // The new error is one narrow exception, not a widening: with a token stored,
  // an upstream failure still collapses to the opaque tag (ADR 0005).
  it.effect("leaves every other failure collapsed to ExtractionFailed", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "claude-code" },
        payload: { value: TOKEN },
      });

      const error = yield* client.import
        .extractPdf({ payload: yield* pdfUpload() })
        .pipe(Effect.flip);

      assert.ok(error instanceof ExtractionFailed);
    }).pipe(
      Effect.provide(
        httpLiveWithStoredToken(() =>
          Effect.fail(
            new BadArgument({
              module: "Command",
              method: "start",
              description: "boom",
            }),
          ),
        ),
      ),
    ),
  );
});

/**
 * The hosted branch **runs** (issue #124), so the reachable state the previous
 * ticket had to refuse — a saved Anthropic key and the task moved onto it — is
 * now the feature. What a client gets back must be indistinguishable from the
 * CLI branch's answer, and the CLI must not be reached at all.
 */
describe("a hosted provider extracts the statement", () => {
  afterEach(() => {
    delete process.env.TOKEN_ENCRYPTION_KEY;
    delete process.env.ANTHROPIC_API_KEY;
  });

  /** Move extraction onto Anthropic, the way the settings page does. */
  const chooseAnthropic = chooseHosted("anthropic", ANTHROPIC_KEY);

  it.effect("returns the same rows and declared totals as the CLI does", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    let spawned = false;
    const { calls, generate } = hostedRecorder(() => Promise.resolve(CCF_OBJECT));

    return Effect.gen(function* () {
      yield* chooseAnthropic;
      const client = yield* HttpApiClient.make(Api);
      const result = yield* client.import.extractPdf({
        payload: yield* pdfUpload(),
      });

      // Byte-for-byte the assertions the CLI branch's first test makes.
      assert.strictEqual(result.transactions.length, 6);
      assert.strictEqual(result.transactions[0].rawIssuerString, "CB AMAZON");
      assert.strictEqual(result.transactions[0].amount, -6.99);
      assert.ok(result.transactions[0].date instanceof Date);
      assert.strictEqual(result.transactions[0].date.toISOString().slice(0, 10), "2026-01-03");
      const credit = result.transactions.find((t) => t.amount > 0);
      assert.strictEqual(credit?.amount, 1947.26);
      assert.deepStrictEqual(result.declaredTotals, {
        debit: 1929.71,
        credit: 1947.26,
      });

      // The uploaded file itself went to the vendor — the same four bytes the
      // multipart body carried, as a document and not as text.
      assert.deepStrictEqual(calls[0]?.document, {
        data: PDF_MAGIC,
        mediaType: "application/pdf",
      });
      // Nothing falls back, in either direction: the CLI was available and
      // was not used.
      assert.isFalse(spawned);
    }).pipe(
      Effect.provide(
        httpLiveWithHosted(generate, () => {
          spawned = true;
          return Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    );
  });

  it.effect("collapses a vendor refusal to ExtractionFailed, key and all", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const { generate } = hostedRecorder(() =>
      // The shape of a real 401: the vendor quotes back what it was handed.
      Promise.reject(new Error(`401 invalid x-api-key: ${ANTHROPIC_KEY}`)),
    );

    return Effect.gen(function* () {
      yield* chooseAnthropic;
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .extractPdf({ payload: yield* pdfUpload() })
        .pipe(Effect.flip);

      // The same deliberately opaque 502 the CLI branch's failures collapse
      // to (ADR 0005) — and nothing of the vendor's message came with it.
      assert.ok(error instanceof ExtractionFailed);
      assert.notInclude(JSON.stringify(error), ANTHROPIC_KEY);
      assert.notInclude(JSON.stringify(error), "x-api-key");
    }).pipe(Effect.provide(httpLiveWithHosted(generate)));
  });

  /**
   * Both ways the vendor can answer, because the statement must not outlive the
   * request either way (ADR 0005, story 29) — and a finalizer that only fires on
   * one of them is exactly the bug a single-path test would keep.
   *
   * Each case's bytes are its own, so the staged dir is found by its contents and
   * no extraction in flight in a parallel test file can be mistaken for it.
   */
  const VENDOR_ANSWERS = [
    {
      answer: "answers",
      marker: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x31]),
      respond: () => Promise.resolve(CCF_OBJECT),
      failed: false,
    },
    {
      answer: "refuses",
      marker: new Uint8Array([0x25, 0x50, 0x44, 0x46, 0x2d, 0x31, 0x32]),
      respond: () => Promise.reject(new Error("503 upstream unavailable")),
      failed: true,
    },
  ] as const;

  for (const outcome of VENDOR_ANSWERS) {
    it.effect(`deletes the statement when the vendor ${outcome.answer}`, () => {
      process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
      const before = stagedDirsBefore();
      let staged = "";

      return Effect.gen(function* () {
        yield* chooseAnthropic;
        const client = yield* HttpApiClient.make(Api);
        const run = client.import.extractPdf({
          payload: yield* pdfUpload({ filename: "RLV.pdf", bytes: outcome.marker }),
        });
        yield* outcome.failed ? Effect.flip(run) : run;

        // It was staged while the vendor call was in flight (ADR 0005's temp
        // dir is transport-independent) — and it is gone now.
        assert.match(staged, /mamen-pdf-/);
        assert.isFalse(existsSync(staged));
      }).pipe(
        Effect.provide(
          httpLiveWithHosted(() => {
            staged = stagedDirOf(outcome.marker, before);
            return outcome.respond();
          }),
        ),
      );
    });
  }

  /**
   * The seam above stands in for the HTTP call, so on its own it would pass just
   * as happily against a runner that never makes one. The three tests below
   * provide **no** seam — the production wiring, the package's own ai-sdk call —
   * and stub `fetch` one layer lower, at the socket the vendor is on.
   *
   * They are what actually hold the acceptance criterion "sent as a base64
   * document part": the base64 is the ai-sdk's doing, not mamen's, and this is
   * the only place mamen can see it. The stub answers with a 400 so the SDK gives
   * up rather than retrying, and the run's failure is beside the point — what is
   * asserted is the request that left.
   *
   * One case per hosted vendor, because **the wire shape is the vendor's, not
   * mamen's**: Anthropic takes a `document` part with a `source`, Google an
   * `inlineData` part, OpenAI a `file` part holding a data URL. Three vendors the
   * user can pick means three shapes that can each be wrong on their own — the
   * seam above cannot tell them apart, because it sits above the conversion that
   * makes them differ.
   */
  interface VendorRequest {
    readonly url: string;
    readonly headers: Headers;
    readonly body: string;
  }

  /**
   * Capture every request that leaves for a vendor, answering each one 400 so the
   * SDK gives up rather than retrying. Requests to `localhost` are the test
   * server's own and go through untouched.
   */
  const captureVendorRequests = () => {
    const realFetch = globalThis.fetch;
    const requests: Array<VendorRequest> = [];
    globalThis.fetch = (async (input: RequestInfo | URL, init?: RequestInit) => {
      const url = input instanceof Request ? input.url : String(input);
      if (url.includes("localhost")) return realFetch(input, init);
      requests.push({
        url,
        headers: new Headers(init?.headers),
        body: String(init?.body ?? ""),
      });
      return new Response(JSON.stringify({ error: { message: "nope" } }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }) as typeof fetch;
    return {
      requests,
      restore: Effect.sync(() => {
        globalThis.fetch = realFetch;
      }),
    };
  };

  /** The statement as one vendor's wire carries it, once dug out of its shape. */
  interface WireDocument {
    readonly mediaType: string;
    readonly data: string;
  }

  /**
   * One hosted vendor's wire: where its key rides, where its model id is written,
   * and how to read the attached statement back out of its own request shape.
   */
  interface WireCase {
    readonly provider: "anthropic" | "google" | "openai";
    readonly key: string;
    readonly model: string;
    readonly host: string;
    readonly credential: (request: VendorRequest) => string | null;
    readonly modelOnTheWire: (request: VendorRequest) => unknown;
    readonly statement: (request: VendorRequest) => WireDocument | undefined;
  }

  const WIRE_CASES: ReadonlyArray<WireCase> = [
    {
      provider: "anthropic",
      key: ANTHROPIC_KEY,
      model: "claude-opus-5",
      host: "api.anthropic.com",
      credential: (request) => request.headers.get("x-api-key"),
      modelOnTheWire: (request) => bodyOf(request).model,
      statement: (request) => {
        const { messages } = bodyOf(request) as {
          messages: Array<{ content: Array<Record<string, never>> }>;
        };
        const part = (messages[0]?.content ?? []).find(
          (candidate: { type?: string }) => candidate.type === "document",
        ) as { source: { type: string; media_type: string; data: string } } | undefined;
        // `source.type` is where Anthropic says base64 rather than a URL or a
        // file id, so a part that is not base64 reads as no document at all.
        return part?.source.type === "base64"
          ? { mediaType: part.source.media_type, data: part.source.data }
          : undefined;
      },
    },
    {
      provider: "google",
      key: GOOGLE_KEY,
      model: "gemini-2.5-pro",
      host: "generativelanguage.googleapis.com",
      credential: (request) => request.headers.get("x-goog-api-key"),
      // Google names the model in the path, not the body.
      modelOnTheWire: (request) => request.url.split("/").pop()?.split(":")[0],
      statement: (request) => {
        const { contents } = bodyOf(request) as {
          contents: Array<{ parts: Array<Record<string, never>> }>;
        };
        const part = (contents[0]?.parts ?? []).find((candidate) => "inlineData" in candidate) as
          | { inlineData: { mimeType: string; data: string } }
          | undefined;
        return part
          ? { mediaType: part.inlineData.mimeType, data: part.inlineData.data }
          : undefined;
      },
    },
    {
      provider: "openai",
      key: OPENAI_KEY,
      model: "gpt-5",
      host: "api.openai.com",
      credential: (request) => request.headers.get("authorization")?.replace("Bearer ", "") ?? null,
      modelOnTheWire: (request) => bodyOf(request).model,
      statement: (request) => {
        const { messages } = bodyOf(request) as {
          messages: Array<{ content: unknown }>;
        };
        const turn = messages.find((message) => Array.isArray(message.content));
        const parts = (turn?.content ?? []) as Array<{ type?: string }>;
        const part = parts.find((candidate) => candidate.type === "file") as
          | { file: { filename: string; file_data: string } }
          | undefined;
        // OpenAI takes the document as a data URL, so the media type and the
        // base64 arrive spelled into one string.
        const url = /^data:([^;]+);base64,(.*)$/.exec(part?.file.file_data ?? "");
        return url?.[1] && url[2] !== undefined ? { mediaType: url[1], data: url[2] } : undefined;
      },
    },
  ];

  for (const wire of WIRE_CASES) {
    it.effect(`posts the statement to ${wire.provider} for real`, () => {
      process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
      const { requests, restore } = captureVendorRequests();

      return Effect.gen(function* () {
        yield* chooseHosted(wire.provider, wire.key, wire.model);
        const client = yield* HttpApiClient.make(Api);
        yield* client.import.extractPdf({ payload: yield* pdfUpload() }).pipe(Effect.flip);

        // One request, to the vendor the user chose, with that vendor's own
        // key — nothing fanned out to a second vendor on the way.
        assert.strictEqual(requests.length, 1);
        const request = requests[0];
        assert.ok(request);
        assert.include(request.url, wire.host);
        assert.strictEqual(wire.credential(request), wire.key);
        // …the model they chose…
        assert.strictEqual(wire.modelOnTheWire(request), wire.model);
        // …and the statement itself, base64, in this vendor's own shape.
        const statement = wire.statement(request);
        assert.ok(statement, `no document part in ${request.body.slice(0, 400)}`);
        assert.strictEqual(statement?.mediaType, "application/pdf");
        assert.strictEqual(statement?.data, Buffer.from(PDF_MAGIC).toString("base64"));
        // The CLI column never travels: no path on this machine, no tool. Nor
        // does the name the user uploaded — the only filename any vendor sees
        // is the SDK's own placeholder.
        assert.notInclude(request.body, "statement.pdf");
        assert.notInclude(request.body, "Read tool");
        assert.notInclude(request.body, "RLV_CHQ1_LUCAS_RIO_001");
      }).pipe(
        Effect.provide(
          httpLiveWith(() =>
            Effect.succeed({
              stdout: okEnvelope(CCF_OBJECT),
              stderr: "",
              exitCode: 0,
            }),
          ),
        ),
        Effect.ensuring(restore),
      );
    });
  }

  /**
   * The one state where a *hosted* provider reaches the run with no usable key
   * (issue #122): the save-time doors read credential **presence** through the
   * status boolean, and a blob that will not decrypt still reports `configured:
   * true` — deliberately, so a rotated `TOKEN_ENCRYPTION_KEY` reads as
   * "re-paste" rather than "nothing was ever here" (ADR 0011). The run is where
   * the difference between present and *usable* is discovered, and it has to
   * arrive as the actionable error, not the retry-able one.
   */
  it.effect("reports a key that no longer decrypts as not configured", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);

    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.secrets.put({
        path: { name: "anthropic" },
        payload: { value: "sk-ant-api03-Kj28fnQ2xLmPqR7v-3f9" },
      });
      yield* client.aiTasks.patch({
        payload: { tasks: [{ task: "extract-pdf", provider: "anthropic" }] },
      });

      // The operator rotates the encryption key. The row survives; what it
      // holds is now unreadable.
      process.env.TOKEN_ENCRYPTION_KEY = "e".repeat(64);
      const statuses = yield* client.secrets.list();
      const anthropic = statuses.find((_) => _.name === "anthropic");
      assert.isTrue(anthropic?.configured);
      assert.strictEqual(anthropic?.hint, null);

      const error = yield* client.import
        .extractPdf({ payload: yield* pdfUpload() })
        .pipe(Effect.flip);

      assert.ok(error instanceof AiProviderNotConfigured);
      assert.strictEqual(error.provider, "anthropic");
    }).pipe(
      Effect.provide(
        httpLiveWith(() =>
          Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          }),
        ),
      ),
    );
  });

  /**
   * The environment is ignored for credentials, and this is the branch where
   * that is not mamen's own code doing the ignoring (PRD #115, story 13).
   *
   * The ai-sdk's `loadApiKey` falls back to `ANTHROPIC_API_KEY` — and to
   * `GOOGLE_GENERATIVE_AI_API_KEY` and `OPENAI_API_KEY` — the moment it is handed
   * no key. The only thing standing between a stale key in a deployment config
   * and a bank statement is the runner refusing to call at all when the store has
   * nothing usable, which is upstream of every assertion in this file.
   *
   * So it is asserted where it can be seen: an unreadable stored blob (a rotated
   * `TOKEN_ENCRYPTION_KEY`, the one reachable way a hosted task meets a missing
   * key) plus a vendor key in the environment must produce the actionable error
   * and **no request at all** — not a run silently paid for by whoever owns the
   * environment's key.
   */
  it.effect("never spends a vendor key that came from the environment", () => {
    process.env.TOKEN_ENCRYPTION_KEY = "a".repeat(64);
    const { requests, restore } = captureVendorRequests();

    return Effect.gen(function* () {
      yield* chooseHosted("anthropic", ANTHROPIC_KEY);

      // The operator rotates the encryption key, so the stored blob is no
      // longer readable — and leaves a key in the environment, the place this
      // feature took credentials *out* of.
      process.env.TOKEN_ENCRYPTION_KEY = "e".repeat(64);
      process.env.ANTHROPIC_API_KEY = "sk-ant-api03-fromTheEnvironment-0001";

      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .extractPdf({ payload: yield* pdfUpload() })
        .pipe(Effect.flip);

      assert.ok(error instanceof AiProviderNotConfigured);
      // Nothing left for the vendor: the environment's key bought nothing,
      // which is the whole of "there is exactly one place any secret lives".
      assert.strictEqual(requests.length, 0);
    }).pipe(
      Effect.provide(
        httpLiveWith(() =>
          Effect.succeed({
            stdout: okEnvelope(CCF_OBJECT),
            stderr: "",
            exitCode: 0,
          }),
        ),
      ),
      Effect.ensuring(restore),
    );
  });
});

/**
 * **Discovery extraction** (issue #217, PRD #216) — the first PDF import, where
 * the account has no **Statement Format** at all and therefore no columns to
 * read the statement against.
 *
 * The operation transcribes the statement's transaction table *as printed*:
 * every column under the bank's own labels, every cell a string, plus the
 * statement's **declared totals**. It is deliberately a second operation rather
 * than an optional `formatId` on `extractPdf` — the two differ in prompt, in
 * response shape and in what they promise — so every test here posts a body
 * carrying nothing but the file, against a database in which no format has been
 * stored.
 */
describe("discoverPdf transcribes a statement with no format", () => {
  /**
   * The canned transcription the deep-fake `claude` returns: the CCF statement's
   * table as the bank printed it. Values are strings — `6,99`, not `-6.99` —
   * because nothing here is parsed; the client-side pipeline reads them once the
   * user has mapped the columns.
   *
   * `table` is nullable in the model's answer, which is how it *says* the
   * document carries no transaction table (see below); the rows and columns are
   * inside it so that "there is no table" cannot be spelled two ways.
   */
  const CCF_TABLE = {
    table: {
      columns: ["Date", "Valeur", "Libellé", "Débit", "Crédit"],
      rows: [
        { Date: "03/01", Valeur: "03/01", Libellé: "CB AMAZON", Débit: "6,99" },
        { Date: "15/01", Valeur: "15/01", Libellé: "VIR SALAIRE ACME", Crédit: "1 947,26" },
      ],
    },
    declaredTotals: { debit: 1929.71, credit: 1947.26 },
  };

  /** The canned transcription, or a variation of it, on the CLI transport. */
  const transcribing =
    (object: unknown): SpawnHandler =>
    () =>
      Effect.succeed({ stdout: okEnvelope(object), stderr: "", exitCode: 0 });

  // The shape, in full: the bank's own column labels in the order it printed
  // them, one object per operation row keyed by those labels, and the
  // statement's own totals line.
  it.effect("returns every column as printed, and rows of strings keyed by them", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const result = yield* client.import.discoverPdf({ payload: statementFormData() });

      assert.deepStrictEqual([...result.columns], ["Date", "Valeur", "Libellé", "Débit", "Crédit"]);
      assert.strictEqual(result.rows.length, 2);
      assert.deepStrictEqual(
        { ...result.rows[0] },
        { Date: "03/01", Valeur: "03/01", Libellé: "CB AMAZON", Débit: "6,99" },
      );
      // As printed, not as read: the French number keeps its comma and the
      // debit keeps no sign. Parsing is the client's, after the mapping.
      assert.deepStrictEqual(
        { ...result.rows[1] },
        { Date: "15/01", Valeur: "15/01", Libellé: "VIR SALAIRE ACME", Crédit: "1 947,26" },
      );
      assert.deepStrictEqual(result.declaredTotals, { debit: 1929.71, credit: 1947.26 });
    }).pipe(Effect.provide(httpLiveWith(transcribing(CCF_TABLE)))),
  );

  /**
   * **No format verdict.** There are no expected columns to verdict against —
   * the whole point of discovery is that the user has no format yet — so the
   * field is not merely empty here, it does not exist. A `matched: true` would
   * claim agreement with a format nobody chose.
   */
  it.effect("carries no format verdict, there being no format to judge", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const result = yield* client.import.discoverPdf({ payload: statementFormData() });

      assert.notProperty(result, "verdict");
    }).pipe(Effect.provide(httpLiveWith(transcribing(CCF_TABLE)))),
  );

  /**
   * A statement with no transaction table is a **typed error**, not a 200
   * carrying an empty table. An empty table reads as "this bank prints no
   * columns" and would put the user in a mapping step with nothing to map;
   * naming the failure tells them the file is the problem (PRD #216, story 20).
   *
   * Three ways the model can say it, one answer — `null` is what it is asked
   * for, and the two degenerate tables are what a model says instead when it
   * answers the letter of the schema rather than the question.
   */
  const NOTHING_TO_TRANSCRIBE = [
    { said: "there is no table", object: { table: null, declaredTotals: null } },
    {
      said: "a table with no columns",
      object: { table: { columns: [], rows: [] }, declaredTotals: null },
    },
    {
      said: "columns but not one row",
      object: { table: { columns: ["Date", "Libellé"], rows: [] }, declaredTotals: null },
    },
  ] as const;

  for (const answer of NOTHING_TO_TRANSCRIBE) {
    it.effect(`fails with NoTransactionTable when the model says ${answer.said}`, () =>
      Effect.gen(function* () {
        const client = yield* HttpApiClient.make(Api);
        const error = yield* client.import
          .discoverPdf({ payload: statementFormData() })
          .pipe(Effect.flip);

        assert.ok(error instanceof NoTransactionTable);
      }).pipe(Effect.provide(httpLiveWith(transcribing(answer.object)))),
    );
  }

  /**
   * The rows are keyed by the columns the table declares, and the endpoint holds
   * itself to that: a cell the model filed under a name the header row does not
   * carry is dropped, rather than travelling as a column no format can ever
   * declare. Spelling is the model's — the column is the table's — so a cell
   * under `" débit "` still lands under `Débit`, the same trimmed, case-folded
   * reading the **format verdict** uses.
   */
  it.effect("keys every cell by a declared column, and drops one that is not", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const result = yield* client.import.discoverPdf({ payload: statementFormData() });

      assert.deepStrictEqual(
        { ...result.rows[0] },
        { Date: "03/01", Libellé: "CB AMAZON", Débit: "6,99" },
      );
    }).pipe(
      Effect.provide(
        httpLiveWith(
          transcribing({
            table: {
              columns: ["Date", "Libellé", "Débit"],
              rows: [{ Date: "03/01", Libellé: "CB AMAZON", " débit ": "6,99", Solde: "1 000,00" }],
            },
            declaredTotals: null,
          }),
        ),
      ),
    ),
  );

  // The same fold `extractPdf` makes (issue #196): a statement that prints no
  // `TOTAL DES OPÉRATIONS` declares none, so the field is absent rather than a
  // pair of zeroes the reconciliation banner would compare against.
  it.effect("leaves the declared totals absent when the statement prints none", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const result = yield* client.import.discoverPdf({ payload: statementFormData() });

      assert.notProperty(result, "declaredTotals");
      assert.strictEqual(result.rows.length, 2);
    }).pipe(Effect.provide(httpLiveWith(transcribing({ ...CCF_TABLE, declaredTotals: null })))),
  );

  it.effect("rejects a non-PDF upload with InvalidFileType (415)", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .discoverPdf({ payload: statementFormData("image/png") })
        .pipe(Effect.flip);

      assert.ok(error instanceof InvalidFileType);
      assert.strictEqual(error.received, "image/png");
    }).pipe(Effect.provide(httpLiveWith(transcribing(CCF_TABLE)))),
  );

  // Everything upstream still collapses to the opaque, retry-able 502 (ADR
  // 0005) — discovery is a second operation, not a second failure taxonomy.
  it.effect("collapses a spawn failure to ExtractionFailed (502)", () =>
    Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .discoverPdf({ payload: statementFormData() })
        .pipe(Effect.flip);

      assert.ok(error instanceof ExtractionFailed);
    }).pipe(
      Effect.provide(
        httpLiveWith(() =>
          Effect.fail(new BadArgument({ module: "Command", method: "start", description: "boom" })),
        ),
      ),
    ),
  );

  /**
   * **Provider-unconfigured fails identically to `extractPdf`** — the same tag,
   * the same task and the same provider, because discovery runs on the *same*
   * stored choice: it is PDF extraction without a format, not a second thing for
   * the user to configure. A second task in the catalogue would have put a
   * second card on the AI settings page and made this error name a task the user
   * has never seen.
   */
  it.effect("fails with AiProviderNotConfigured when no token has been pasted", () => {
    let spawned = false;
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      const error = yield* client.import
        .discoverPdf({ payload: statementFormData() })
        .pipe(Effect.flip);

      assert.ok(error instanceof AiProviderNotConfigured);
      assert.strictEqual(error.task, "extract-pdf");
      assert.strictEqual(error.provider, "claude-code");
      assert.isFalse(spawned);
    }).pipe(
      Effect.provide(
        httpLiveWithStoredToken(() => {
          spawned = true;
          return Effect.succeed({
            stdout: okEnvelope(CCF_TABLE),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    );
  });

  // The **transient temp dir** is the endpoint's own, not the shared helper's
  // by assumption: a handler that forgot `Effect.scoped` would leave the
  // statement on disk after answering (ADR 0005).
  it.effect("deletes the staged statement afterwards", () => {
    let dir = "";
    return Effect.gen(function* () {
      const client = yield* HttpApiClient.make(Api);
      yield* client.import.discoverPdf({ payload: statementFormData() });

      assert.match(dir, /mamen-pdf-/);
      assert.isFalse(existsSync(dir));
    }).pipe(
      Effect.provide(
        httpLiveWith((input) => {
          dir = stagedIn(input.args);
          assert.isTrue(existsSync(`${dir}/statement.pdf`));
          return Effect.succeed({
            stdout: okEnvelope(CCF_TABLE),
            stderr: "",
            exitCode: 0,
          });
        }),
      ),
    );
  });
});
