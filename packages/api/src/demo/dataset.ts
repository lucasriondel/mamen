import type { SubscriptionFrequency, SubscriptionStatus } from "@mamen/shared/contract";
import { deriveBundleParent } from "../transactions/bundle-derivation";
import type { WriteRow } from "../transactions/repository";

/**
 * The demo dataset (issue #139) — one household's six months of banking, all of
 * it invented, as pure data.
 *
 * **Everything here is synthetic and must stay that way.** The counterparties
 * are placeholder names, not shops anyone goes to (a merchant list is as
 * identifying as an account number), and every account number is built on
 * {@link RESERVED_IBAN_PREFIX}: `99999` is not an allocated French bank code and
 * the check digits do not validate, so none of these strings can be an account
 * that exists. `packages/web/src/test/bank-statement-scrubbed.test.ts` names this
 * file as one of the two places in the repo allowed to carry an IBAN at all, and
 * holds the ones here to that prefix.
 *
 * Nothing in this module reads a clock, an environment variable or an unseeded
 * random: the dates are pinned (Recap buckets by period, so a moving clock makes
 * screenshots unreproducible) and the everyday variation comes from one seeded
 * PRNG. Building the dataset twice, on any machine, gives the same rows with the
 * same ids — which is what lets the seeder be re-run rather than re-created.
 *
 * The shape traps this file exists to get right, each of which makes a screen
 * look broken rather than throw:
 *
 * - `importMonth` is required and drives the Accounts month grid, so every
 *   account carries rows in every month.
 * - A transfer group's id is the **smallest** transaction id among its legs, on
 *   every leg.
 * - A **bundle parent** carries no bundle id; its members point at it, and its
 *   amount is what they sum to — derived here through the same
 *   {@link deriveBundleParent} every write path uses, never a second copy.
 * - An issuer's default category must be a childless leaf, so the slugs below
 *   are all leaves of the seeded tree (migration `0010_seed_categories`).
 * - Amounts are EUR, negative for spend, and only ever whole cents.
 */

/** The months the demo covers, oldest first — six statements per account. */
export const DEMO_MONTHS = [
  "2026-01",
  "2026-02",
  "2026-03",
  "2026-04",
  "2026-05",
  "2026-06",
] as const;

/**
 * The reserved prefix every account number in this file is built on — the same
 * one the Green-Got import fixture uses, for the same reason.
 */
export const RESERVED_IBAN_PREFIX = "FR7699999";

/** The four account numbers the statements name, all in the reserved range. */
const IBAN = {
  current: "FR7699999000010000000000201",
  joint: "FR7699999000010000000000202",
  savings: "FR7699999000010000000000203",
  landlord: "FR7699999000010000000000301",
} as const;

/**
 * When this database was made: the morning after the last statement was
 * imported. Every `createdAt`, `importedAt` and detection timestamp is derived
 * from it or from a month, so nothing here is stamped by a clock.
 */
export const DEMO_MADE_AT = "2026-07-02T09:00:00.000Z";

/**
 * The seed for the everyday variation. A fixed integer, so the "random" grocery
 * runs are the same grocery runs everywhere; changing it re-rolls the whole
 * dataset, which is a deliberate act and not a side effect of running the
 * seeder again.
 */
const PRNG_SEED = 0x6d616d65;

/** Account ids, fixed so a rule's account matcher can name one. */
const CURRENT = 1;
const JOINT = 2;
const SAVINGS = 3;

export type DemoAccount = {
  readonly id: number;
  readonly name: string;
  readonly type: string;
  readonly color: string;
  readonly createdAt: string;
  readonly updatedAt: string;
};

export type DemoIssuer = {
  readonly id: number;
  readonly name: string;
  /** The **leaf** category rows under this issuer inherit; `null` = no default. */
  readonly categorySlug: string | null;
  readonly excludedFromRecap: boolean;
  readonly notes: string | null;
  readonly createdAt: string;
  readonly firstSeen: string;
};

export type DemoRule = {
  readonly id: number;
  readonly issuerId: number;
  readonly pattern: string;
  readonly matchValue: number | null;
  readonly matchAccountId: number | null;
  readonly matchSign: "positive" | "negative" | null;
  readonly createdAt: string;
};

/**
 * A stored transaction row, with its id, and its category named by **slug**
 * rather than by id: the category tree is planted by a migration and its ids are
 * whatever the migrator handed out, so the seeder resolves the slug against the
 * database it is writing to. Everything else is exactly the column set
 * {@link WriteRow} describes, so a column added to the table stops this file
 * compiling rather than being silently left unwritten.
 */
export type DemoTransaction = Omit<WriteRow, "categoryId"> & {
  readonly id: number;
  readonly categorySlug: string | null;
};

export type DemoSubscription = {
  readonly id: number;
  readonly issuerId: number;
  readonly issuerName: string;
  readonly typicalAmount: number;
  readonly frequency: SubscriptionFrequency;
  readonly intervalDays: number;
  readonly lastChargeDate: string;
  readonly firstChargeDate: string;
  readonly chargeCount: number;
  readonly status: SubscriptionStatus;
  readonly transactionIds: ReadonlyArray<number>;
  readonly detectedAt: string;
  readonly updatedAt: string;
};

export type DemoDataset = {
  readonly accounts: ReadonlyArray<DemoAccount>;
  readonly issuers: ReadonlyArray<DemoIssuer>;
  readonly rules: ReadonlyArray<DemoRule>;
  readonly transactions: ReadonlyArray<DemoTransaction>;
  readonly subscriptions: ReadonlyArray<DemoSubscription>;
};

/**
 * mulberry32 — 32-bit integer arithmetic only, so the sequence is identical on
 * every engine. `Math.random()` would make the demo database a different
 * database on every run, which is the one thing it may not be.
 */
const mulberry32 = (seed: number) => {
  let a = seed;
  return () => {
    a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
};

/** An integer in `[min, max]`, inclusive. */
const between = (rng: () => number, min: number, max: number) =>
  min + Math.floor(rng() * (max - min + 1));

/** Cents to euros — money is generated in whole cents and divided back once. */
const euros = (cents: number) => cents / 100;

/**
 * Midday UTC, deliberately: a row dated at midnight would read as the previous
 * day west of Greenwich and the app formats dates in the reader's zone.
 */
const dateOf = (month: string, day: number) =>
  `${month}-${String(day).padStart(2, "0")}T12:00:00.000Z`;

/** The two-digit day and month a card label carries (`CARTE 12/03 …`). */
const stamp = (month: string, day: number) => `${String(day).padStart(2, "0")}/${month.slice(5)}`;

/**
 * When the statement holding a month's rows was imported: the 2nd of the month
 * after it, at 9am. Built through `Date.UTC`, whose month argument rolls a
 * December over into the next January on its own — a string-arithmetic version
 * needs a branch for that one month a year, and it is the branch nothing tests.
 */
const importedAtFor = (month: string) => {
  const [year, index] = month.split("-").map(Number);
  return new Date(Date.UTC(year, index, 2, 9)).toISOString();
};

/** One statement: an account's month, the unit an import batch covers. */
const batchOf = (accountId: number, month: string) => `demo-${month}-account-${accountId}`;

/**
 * The counterparties. Invented, every one of them — the ticket's first rule and
 * the reason this list is written out rather than lifted from anyone's history.
 * `categorySlug` names a **leaf** of the seeded tree; the API refuses an issuer
 * whose default is a folder.
 */
const ISSUERS: ReadonlyArray<{
  readonly key: string;
  readonly name: string;
  readonly categorySlug: string | null;
  readonly excludedFromRecap?: boolean;
  readonly notes?: string;
}> = [
  { key: "cornouaille", name: "Marché Cornouaille", categorySlug: "groceries" },
  { key: "valmont", name: "Épicerie Valmont", categorySlug: "groceries" },
  { key: "perrin", name: "Café Perrin", categorySlug: "cafes" },
  { key: "quai", name: "Brasserie du Quai", categorySlug: "restaurants" },
  { key: "lumen", name: "Studio Lumen", categorySlug: "subscriptions" },
  {
    key: "lumen-cine",
    name: "Studio Lumen Ciné",
    categorySlug: "events",
    notes:
      "The cinema add-on, billed apart from the 11,99 € subscription — a narrower issuer so the two land in different categories.",
  },
  { key: "nimbus", name: "Nimbus Stockage", categorySlug: "subscriptions" },
  { key: "fibrelia", name: "Fibrelia", categorySlug: "internet-phone" },
  { key: "voltis", name: "Voltis Énergie", categorySlug: "energy" },
  { key: "beaulieu", name: "Assurance Beaulieu", categorySlug: "insurance" },
  { key: "malbec", name: "Régie Malbec", categorySlug: "rent" },
  { key: "rivage", name: "Transports Rivage", categorySlug: "transit" },
  { key: "ourcq", name: "Station Ourcq", categorySlug: "fuel-charging" },
  { key: "delatour", name: "Pharmacie Delatour", categorySlug: "health" },
  { key: "patoune", name: "Animalerie Patoune", categorySlug: "pets" },
  { key: "ponceau", name: "Librairie Ponceau", categorySlug: "shopping" },
  { key: "odyssee", name: "Cinéma Odyssée", categorySlug: "events" },
  { key: "zenith", name: "Zénith Aérien", categorySlug: "travel" },
  { key: "verlaine", name: "Groupe Verlaine", categorySlug: "salary" },
  { key: "tresorerie", name: "Trésorerie Valmont", categorySlug: "taxes" },
  { key: "interne", name: "Virement interne", categorySlug: "transfers" },
  {
    key: "kolibri",
    name: "Kolibri Partage",
    categorySlug: "uncategorised",
    excludedFromRecap: true,
    notes:
      "Shared-expenses app: it charges the whole bill and the others pay their share back, so its rows are held out of the recap at the issuer.",
  },
];

const issuerId = (key: string) => {
  const index = ISSUERS.findIndex((i) => i.key === key);
  if (index === -1) throw new Error(`demo dataset: unknown issuer "${key}"`);
  return index + 1;
};

/**
 * The **Matching Rules**. Every seeded row's issuer is one a rule would derive
 * (`demo/seed.test.ts` re-derives the whole table against these and asserts
 * nothing moves) — except the one row deliberately left hand-assigned, which is
 * what `manualIssuer` is for.
 *
 * Three of them carry a predicate, so the Rules page shows what they are for:
 * `VIR SEPA MENSUEL` means rent on the joint account and a transfer to savings
 * on the personal one (an **account matcher**, the two can never compete for a
 * row); the cinema add-on forks off the subscription by amount (a **value
 * matcher**); the employer is only ever money in (a **sign matcher**).
 */
const RULES: ReadonlyArray<{
  readonly issuerKey: string;
  readonly pattern: string;
  readonly matchValue?: number;
  readonly matchAccountId?: number;
  readonly matchSign?: "positive" | "negative";
}> = [
  { issuerKey: "cornouaille", pattern: "MARCHE CORNOUAILLE" },
  { issuerKey: "valmont", pattern: "EPICERIE VALMONT" },
  { issuerKey: "perrin", pattern: "CAFE PERRIN" },
  { issuerKey: "quai", pattern: "BRASSERIE DU QUAI" },
  { issuerKey: "lumen", pattern: "STUDIO LUMEN" },
  { issuerKey: "lumen-cine", pattern: "STUDIO LUMEN", matchValue: 5.99 },
  { issuerKey: "nimbus", pattern: "NIMBUS STOCKAGE" },
  { issuerKey: "fibrelia", pattern: "FIBRELIA" },
  { issuerKey: "voltis", pattern: "VOLTIS ENERGIE" },
  { issuerKey: "beaulieu", pattern: "ASSURANCE BEAULIEU" },
  { issuerKey: "rivage", pattern: "TRANSPORTS RIVAGE" },
  { issuerKey: "ourcq", pattern: "STATION OURCQ" },
  { issuerKey: "delatour", pattern: "PHARMACIE DELATOUR" },
  { issuerKey: "patoune", pattern: "ANIMALERIE PATOUNE" },
  { issuerKey: "ponceau", pattern: "LIBRAIRIE PONCEAU" },
  { issuerKey: "odyssee", pattern: "CINEMA ODYSSEE" },
  { issuerKey: "zenith", pattern: "ZENITH AERIEN" },
  { issuerKey: "tresorerie", pattern: "TRESORERIE VALMONT" },
  { issuerKey: "kolibri", pattern: "KOLIBRI PARTAGE" },
  { issuerKey: "verlaine", pattern: "GROUPE VERLAINE", matchSign: "positive" },
  { issuerKey: "malbec", pattern: "VIR SEPA MENSUEL", matchAccountId: JOINT },
  {
    issuerKey: "interne",
    pattern: "VIR SEPA MENSUEL",
    matchAccountId: CURRENT,
  },
  { issuerKey: "interne", pattern: "VIR SEPA RECU" },
  { issuerKey: "interne", pattern: "VERS COMPTE JOINT" },
];

/** A row before it has an id: what the plan holds until the whole set is sorted. */
type Planned = {
  readonly accountId: number;
  readonly date: string;
  readonly amount: number;
  readonly rawIssuerString: string;
  readonly issuerKey?: string;
  readonly manualIssuer?: true;
  readonly categorySlug?: string;
  readonly isRefund?: true;
  /** The {@link Planned.ref} of the row this one reverses. */
  readonly refundOf?: string;
  /** A name other planned rows point at (a refund's original, a bundle's members). */
  readonly ref?: string;
  /** Legs sharing a tag become one transfer group. */
  readonly transferTag?: string;
  /** Members sharing a tag hang off the parent declared with the same tag. */
  readonly bundleTag?: string;
  readonly isDuplicateExcluded?: true;
  readonly duplicateNote?: string;
  readonly manualExcluded?: true;
  readonly notes?: string;
};

/**
 * A recurring charge and, when it is one, the subscription that stands for it.
 * `cents` is either one amount every month or one per covered month — the energy
 * bill falls through the spring, which is what makes a by-issuer recap over two
 * periods show something other than the same number twice.
 */
type Recurring = {
  readonly issuerKey: string;
  readonly accountId: number;
  readonly day: number;
  readonly label: (month: string) => string;
  readonly cents: number | ReadonlyArray<number>;
  /** Indexes into {@link DEMO_MONTHS}; every month when absent. */
  readonly months?: ReadonlyArray<number>;
  readonly sign?: "credit";
  readonly subscription?: {
    readonly frequency: SubscriptionFrequency;
    readonly intervalDays: number;
    readonly status: SubscriptionStatus;
  };
};

const MONTHLY = { frequency: "monthly" as const, intervalDays: 30 };

const RECURRING: ReadonlyArray<Recurring> = [
  {
    issuerKey: "verlaine",
    accountId: CURRENT,
    day: 27,
    label: (month) => `VIR SEPA GROUPE VERLAINE SALAIRE ${month.slice(5)}/${month.slice(0, 4)}`,
    cents: 245_000,
    sign: "credit",
  },
  {
    issuerKey: "malbec",
    accountId: JOINT,
    day: 3,
    label: () => `VIR SEPA MENSUEL ${IBAN.landlord}`,
    cents: 98_000,
    subscription: { ...MONTHLY, status: "active" },
  },
  {
    issuerKey: "voltis",
    accountId: JOINT,
    day: 10,
    label: (month) => `PRLV SEPA VOLTIS ENERGIE ${month}`,
    cents: [7810, 7460, 6630, 5420, 4890, 4430],
    subscription: { ...MONTHLY, status: "active" },
  },
  {
    issuerKey: "beaulieu",
    accountId: JOINT,
    day: 15,
    label: () => "PRLV SEPA ASSURANCE BEAULIEU HABITATION",
    cents: 2450,
    subscription: { ...MONTHLY, status: "active" },
  },
  {
    issuerKey: "fibrelia",
    accountId: CURRENT,
    day: 8,
    label: () => "PRLV SEPA FIBRELIA FIBRE+MOBILE",
    cents: 2999,
    subscription: { ...MONTHLY, status: "active" },
  },
  {
    issuerKey: "lumen",
    accountId: CURRENT,
    day: 5,
    label: () => "PRLV SEPA STUDIO LUMEN",
    cents: 1199,
    subscription: { ...MONTHLY, status: "active" },
  },
  {
    issuerKey: "lumen-cine",
    accountId: CURRENT,
    day: 5,
    label: () => "PRLV SEPA STUDIO LUMEN CINE",
    cents: 599,
    months: [3, 4, 5],
    subscription: { ...MONTHLY, status: "active" },
  },
  {
    issuerKey: "nimbus",
    accountId: CURRENT,
    day: 12,
    label: () => "PRLV SEPA NIMBUS STOCKAGE 200GO",
    cents: 499,
    months: [0, 1, 2],
    subscription: { ...MONTHLY, status: "possibly-cancelled" },
  },
  {
    issuerKey: "rivage",
    accountId: CURRENT,
    day: 2,
    label: (month) => `CARTE ${stamp(month, 2)} TRANSPORTS RIVAGE ABONNEMENT`,
    cents: 7520,
    subscription: { ...MONTHLY, status: "active" },
  },
  {
    issuerKey: "tresorerie",
    accountId: CURRENT,
    day: 16,
    label: () => "PRLV SEPA TRESORERIE VALMONT TAXE HABITATION",
    cents: 8900,
    months: [1, 4],
  },
];

/**
 * The everyday spend, as ranges the seeded PRNG draws from. Ranges rather than
 * literals because 180 hand-written grocery runs would be a worse file and no
 * more real; the seed is what makes them the same 180 rows every time.
 */
const EVERYDAY: ReadonlyArray<{
  readonly issuerKey?: string;
  readonly accountId: number;
  readonly label: string;
  readonly perMonth: readonly [number, number];
  readonly cents: readonly [number, number];
  /** A direct debit rather than a card payment (no `CARTE dd/mm` prefix). */
  readonly direct?: true;
}> = [
  {
    issuerKey: "cornouaille",
    accountId: CURRENT,
    label: "MARCHE CORNOUAILLE",
    perMonth: [3, 5],
    cents: [1840, 8920],
  },
  {
    issuerKey: "valmont",
    accountId: CURRENT,
    label: "EPICERIE VALMONT",
    perMonth: [1, 3],
    cents: [1150, 4640],
  },
  {
    issuerKey: "perrin",
    accountId: CURRENT,
    label: "CAFE PERRIN",
    perMonth: [2, 5],
    cents: [240, 880],
  },
  {
    issuerKey: "quai",
    accountId: CURRENT,
    label: "BRASSERIE DU QUAI",
    perMonth: [1, 2],
    cents: [2210, 6480],
  },
  {
    issuerKey: "ourcq",
    accountId: CURRENT,
    label: "STATION OURCQ",
    perMonth: [0, 1],
    cents: [4210, 7430],
  },
  {
    issuerKey: "delatour",
    accountId: CURRENT,
    label: "PHARMACIE DELATOUR",
    perMonth: [0, 1],
    cents: [860, 3410],
  },
  {
    issuerKey: "ponceau",
    accountId: CURRENT,
    label: "LIBRAIRIE PONCEAU",
    perMonth: [0, 1],
    cents: [1230, 4930],
  },
  {
    issuerKey: "kolibri",
    accountId: CURRENT,
    label: "KOLIBRI PARTAGE",
    perMonth: [0, 1],
    cents: [1510, 4270],
    direct: true,
  },
  {
    issuerKey: "cornouaille",
    accountId: JOINT,
    label: "MARCHE CORNOUAILLE",
    perMonth: [1, 2],
    cents: [3420, 9840],
  },
  {
    issuerKey: "patoune",
    accountId: JOINT,
    label: "ANIMALERIE PATOUNE",
    perMonth: [0, 1],
    cents: [1830, 5620],
  },
  {
    issuerKey: "odyssee",
    accountId: JOINT,
    label: "CINEMA ODYSSEE",
    perMonth: [0, 1],
    cents: [1080, 2400],
  },
  // No issuer and no rule: the uncurated rows the table tints and the recap
  // reports as *Unassigned*. A demo where everything is neatly categorised
  // shows none of the work the app is for.
  {
    accountId: CURRENT,
    label: "PAIEMENT CB 4907",
    perMonth: [1, 1],
    cents: [910, 3620],
  },
];

/**
 * The rows that are not a pattern: the transfers, the bundle, the refund, the
 * duplicate, and the three rows carrying a decision the user made by hand. Each
 * one exists because a screen has a state that only it produces.
 */
const specialRows = (): ReadonlyArray<Planned> => {
  const rows: Array<Planned> = [];

  // One internal transfer a month, confirmed: 250 € to the savings account. The
  // legs balance to the cent and land the same day, so the recap reports them on
  // its *Internal transfers* line instead of counting them as spend.
  for (const month of DEMO_MONTHS) {
    rows.push(
      {
        accountId: CURRENT,
        date: dateOf(month, 28),
        amount: -250,
        rawIssuerString: `VIR SEPA MENSUEL ${IBAN.savings}`,
        issuerKey: "interne",
        transferTag: `savings-${month}`,
      },
      {
        accountId: SAVINGS,
        date: dateOf(month, 28),
        amount: 250,
        rawIssuerString: `VIR SEPA RECU ${IBAN.current}`,
        issuerKey: "interne",
        transferTag: `savings-${month}`,
      },
    );
  }

  // The same movement, left ungrouped: a detected-but-unconfirmed pair, so the
  // Transfers page has something to act on rather than an empty state.
  rows.push(
    {
      accountId: CURRENT,
      date: dateOf("2026-06", 18),
      amount: -180,
      rawIssuerString: `VIR SEPA VERS COMPTE JOINT ${IBAN.joint}`,
      issuerKey: "interne",
    },
    {
      accountId: JOINT,
      date: dateOf("2026-06", 19),
      amount: 180,
      rawIssuerString: `VIR SEPA RECU COMPTE JOINT ${IBAN.current}`,
      issuerKey: "interne",
    },
  );

  // A weekend away, told by the bank in three rows: two costs and the share a
  // friend paid back. One 140,50 € operation, not a large debit filed apart from
  // an unexplained credit.
  rows.push(
    {
      accountId: CURRENT,
      date: dateOf("2026-03", 14),
      amount: -186,
      rawIssuerString: `CARTE ${stamp("2026-03", 14)} ZENITH AERIEN`,
      issuerKey: "zenith",
      bundleTag: "weekend",
    },
    {
      accountId: CURRENT,
      date: dateOf("2026-03", 15),
      amount: -74.5,
      rawIssuerString: `CARTE ${stamp("2026-03", 15)} BRASSERIE DU QUAI`,
      issuerKey: "quai",
      bundleTag: "weekend",
    },
    {
      accountId: CURRENT,
      date: dateOf("2026-03", 21),
      amount: 120,
      rawIssuerString: "VIR INST PART LISE WEEK-END",
      bundleTag: "weekend",
    },
  );

  // A purchase and the refund that reverses it, linked — the refund is money in,
  // so it never reaches a spend bucket, and neither row is offered as a transfer.
  rows.push(
    {
      accountId: CURRENT,
      date: dateOf("2026-04", 8),
      amount: -48.9,
      rawIssuerString: `CARTE ${stamp("2026-04", 8)} LIBRAIRIE PONCEAU`,
      issuerKey: "ponceau",
      ref: "ponceau-purchase",
    },
    {
      accountId: CURRENT,
      date: dateOf("2026-04", 15),
      amount: 48.9,
      rawIssuerString: "REMBOURSEMENT LIBRAIRIE PONCEAU",
      issuerKey: "ponceau",
      isRefund: true,
      refundOf: "ponceau-purchase",
    },
  );

  // The bank sent one charge twice. The copy is held out of the totals, and the
  // recap's *Excluded* line says how much that is.
  const dup = {
    accountId: JOINT,
    date: dateOf("2026-05", 6),
    amount: -64.2,
    rawIssuerString: `CARTE ${stamp("2026-05", 6)} MARCHE CORNOUAILLE`,
    issuerKey: "cornouaille",
  } as const;
  rows.push(dup, {
    ...dup,
    isDuplicateExcluded: true,
    duplicateNote: "Same charge on the statement twice — the bank reissued it.",
  });

  // Three decisions a user made by hand, each of which the app has to keep
  // against every later re-derivation.
  rows.push(
    {
      accountId: CURRENT,
      date: dateOf("2026-02", 19),
      amount: -132,
      rawIssuerString: `CARTE ${stamp("2026-02", 19)} BRASSERIE DU QUAI`,
      issuerKey: "quai",
      manualExcluded: true,
      notes: "Team dinner — expensed, so it is not our spending.",
    },
    {
      accountId: CURRENT,
      date: dateOf("2026-02", 24),
      amount: -46.3,
      rawIssuerString: "PAIEMENT CB 4907 62110",
      issuerKey: "quai",
      manualIssuer: true,
      notes: "The card terminal printed no name; assigned by hand.",
    },
    {
      accountId: CURRENT,
      date: dateOf("2026-01", 22),
      amount: -78.4,
      rawIssuerString: `CARTE ${stamp("2026-01", 22)} MARCHE CORNOUAILLE`,
      issuerKey: "cornouaille",
      categorySlug: "gifts-donations",
      notes: "A hamper, not the weekly shop.",
    },
  );

  // The savings account earns something, from nobody.
  rows.push({
    accountId: SAVINGS,
    date: dateOf("2026-06", 30),
    amount: 12.35,
    rawIssuerString: "INTERETS LIVRET EPARGNE",
  });

  return rows;
};

/** Every recurring row, month by month, with the ids of the ones a subscription covers. */
const recurringRows = (): {
  rows: ReadonlyArray<Planned>;
  series: ReadonlyArray<{ spec: Recurring; refs: ReadonlyArray<string> }>;
} => {
  const rows: Array<Planned> = [];
  const series: Array<{ spec: Recurring; refs: ReadonlyArray<string> }> = [];

  for (const spec of RECURRING) {
    const refs: Array<string> = [];
    for (const [index, month] of DEMO_MONTHS.entries()) {
      if (spec.months !== undefined && !spec.months.includes(index)) continue;

      const cents = typeof spec.cents === "number" ? spec.cents : spec.cents[index];
      const ref = `recurring-${spec.issuerKey}-${month}`;
      refs.push(ref);
      rows.push({
        accountId: spec.accountId,
        date: dateOf(month, spec.day),
        amount: spec.sign === "credit" ? euros(cents) : -euros(cents),
        rawIssuerString: spec.label(month),
        issuerKey: spec.issuerKey,
        ref,
      });
    }
    series.push({ spec, refs });
  }

  return { rows, series };
};

/** The everyday draws, in a fixed order so the PRNG sequence is fixed too. */
const everydayRows = (rng: () => number): ReadonlyArray<Planned> => {
  const rows: Array<Planned> = [];

  for (const month of DEMO_MONTHS) {
    for (const spec of EVERYDAY) {
      const count = between(rng, spec.perMonth[0], spec.perMonth[1]);
      for (let n = 0; n < count; n += 1) {
        const day = between(rng, 1, 28);
        const cents = between(rng, spec.cents[0], spec.cents[1]);
        rows.push({
          accountId: spec.accountId,
          date: dateOf(month, day),
          amount: -euros(cents),
          rawIssuerString: spec.direct
            ? `PRLV SEPA ${spec.label}`
            : `CARTE ${stamp(month, day)} ${spec.label}`,
          ...(spec.issuerKey === undefined ? {} : { issuerKey: spec.issuerKey }),
        });
      }
    }
  }

  return rows;
};

/**
 * The **bundle parent** for a tag, planned from its members. The number and the
 * date come from {@link deriveBundleParent} — the one place a bundle's number
 * comes from — handed the members' plan order as ids, which is what breaks a
 * date tie and is the same order the real ids will be assigned in.
 */
const bundleParent = (
  members: ReadonlyArray<{ planned: Planned; order: number }>,
  label: string,
  categorySlug: string,
  tag: string,
): Planned => {
  const derived = deriveBundleParent(
    members.map((m) => ({
      id: m.order,
      date: new Date(m.planned.date),
      amount: m.planned.amount,
      accountId: m.planned.accountId,
      importMonth: m.planned.date.slice(0, 7),
    })),
  );
  if (derived === undefined) throw new Error(`demo dataset: bundle "${tag}" has no members`);

  return {
    accountId: derived.accountId,
    date: derived.date.toISOString(),
    amount: derived.amount,
    rawIssuerString: label,
    categorySlug,
    ref: `bundle-parent-${tag}`,
  };
};

/** The label and category the one seeded bundle is curated with. */
const BUNDLES = [{ tag: "weekend", label: "Week-end à Sète", categorySlug: "travel" }] as const;

/**
 * Build the whole demo dataset: accounts, issuers, rules, transactions and the
 * subscriptions standing for the recurring charges among them.
 *
 * Ids are assigned by sorting the plan by date and numbering from 1, so the
 * database reads the way an import history would — and, because the sort is
 * stable and the plan is deterministic, the same row gets the same id on every
 * machine. The groupings are resolved afterwards, once every row has its id:
 * that ordering is not incidental, it is what makes a transfer group's id the
 * smallest leg's rather than a counter's.
 */
export const buildDemoDataset = (): DemoDataset => {
  const rng = mulberry32(PRNG_SEED);
  const { rows: recurring, series } = recurringRows();
  const planned: Array<Planned> = [...recurring, ...everydayRows(rng), ...specialRows()];

  // The parents join the plan before ids are handed out, so a parent is an
  // ordinary row of the table exactly as it is in the app.
  for (const bundle of BUNDLES) {
    const members = planned
      .map((row, order) => ({ planned: row, order }))
      .filter((m) => m.planned.bundleTag === bundle.tag);
    planned.push(bundleParent(members, bundle.label, bundle.categorySlug, bundle.tag));
  }

  // Stable sort by date alone: rows sharing a day keep the order they were
  // planned in, which is a property of this file and not of the sort.
  const ordered = [...planned].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const idOf = new Map<string, number>();
  for (const [index, row] of ordered.entries()) {
    if (row.ref !== undefined) idOf.set(row.ref, index + 1);
  }

  /** The id behind a planned row's name. A name nothing answers to is a typo. */
  const refId = (ref: string) => {
    const id = idOf.get(ref);
    if (id === undefined) throw new Error(`demo dataset: unknown row "${ref}"`);
    return id;
  };

  // Group ids, resolved now that every row has one. A transfer group's id is the
  // smallest leg's; a bundle member points at its parent.
  const transferGroups = new Map<string, number>();
  for (const [index, row] of ordered.entries()) {
    if (row.transferTag === undefined) continue;
    const current = transferGroups.get(row.transferTag);
    transferGroups.set(
      row.transferTag,
      current === undefined ? index + 1 : Math.min(current, index + 1),
    );
  }

  const transactions: ReadonlyArray<DemoTransaction> = ordered.map((row, index) => {
    const month = row.date.slice(0, 7);
    const isParent = row.ref?.startsWith("bundle-parent-") === true;
    return {
      id: index + 1,
      accountId: row.accountId,
      date: row.date,
      amount: row.amount,
      rawIssuerString: row.rawIssuerString,
      issuerId: row.issuerKey === undefined ? null : issuerId(row.issuerKey),
      categorySlug: row.categorySlug ?? null,
      // A category the user typed is the only reason a row carries one of its
      // own: everything else reads its issuer's default (ADR 0002).
      manualCategory: row.categorySlug === undefined ? 0 : 1,
      manualIssuer: row.manualIssuer === true ? 1 : 0,
      isRefund: row.isRefund === true ? 1 : 0,
      linkedRefundId: row.refundOf === undefined ? null : refId(row.refundOf),
      transferGroupId:
        row.transferTag === undefined ? null : (transferGroups.get(row.transferTag) ?? null),
      kind: isParent ? "bundle" : "bank",
      bundleId: row.bundleTag === undefined ? null : refId(`bundle-parent-${row.bundleTag}`),
      manualDate: 0,
      anomalyFlags: null,
      isDuplicateExcluded: row.isDuplicateExcluded === true ? 1 : 0,
      duplicateNote: row.duplicateNote ?? null,
      // Exclusion is the issuer's business unless the user said otherwise —
      // so a hand-excluded row carries both flags and nothing else carries
      // either (ADR 0008).
      excludedFromRecap: row.manualExcluded === true ? 1 : 0,
      manualExcluded: row.manualExcluded === true ? 1 : 0,
      notes: row.notes ?? null,
      importedAt: importedAtFor(month),
      importMonth: month,
      importBatchId: batchOf(row.accountId, month),
    };
  });

  const byId = new Map(transactions.map((t) => [t.id, t]));

  const accounts: ReadonlyArray<DemoAccount> = [
    { id: CURRENT, name: "Compte courant", type: "checking", color: "#2563eb" },
    { id: JOINT, name: "Compte joint", type: "checking", color: "#16a34a" },
    { id: SAVINGS, name: "Livret épargne", type: "savings", color: "#9333ea" },
  ].map((account) => ({
    ...account,
    createdAt: DEMO_MADE_AT,
    updatedAt: DEMO_MADE_AT,
  }));

  const issuers: ReadonlyArray<DemoIssuer> = ISSUERS.map((issuer, index) => {
    const id = index + 1;
    const first = transactions
      .filter((t) => t.issuerId === id)
      .map((t) => t.date)
      .sort()[0];
    return {
      id,
      name: issuer.name,
      categorySlug: issuer.categorySlug,
      excludedFromRecap: issuer.excludedFromRecap === true,
      notes: issuer.notes ?? null,
      createdAt: DEMO_MADE_AT,
      // When the issuer was first seen is a fact about the rows, not a date to
      // invent: it is the earliest one carrying it.
      firstSeen: first ?? DEMO_MADE_AT,
    };
  });

  const rules: ReadonlyArray<DemoRule> = RULES.map((rule, index) => ({
    id: index + 1,
    issuerId: issuerId(rule.issuerKey),
    pattern: rule.pattern,
    matchValue: rule.matchValue ?? null,
    matchAccountId: rule.matchAccountId ?? null,
    matchSign: rule.matchSign ?? null,
    createdAt: DEMO_MADE_AT,
  }));

  // Only the recurring series that declare one become a subscription — a
  // quarterly tax bill is a recurring charge and not a subscription. `flatMap`
  // rather than filter-then-map so the declaration is narrowed by the check that
  // selected it, instead of being read back through an optional a second time.
  const subscriptions: ReadonlyArray<DemoSubscription> = series
    .flatMap(({ spec, refs }) => {
      if (spec.subscription === undefined) return [];

      const rows = refs.map((ref) => byId.get(refId(ref)) as DemoTransaction);
      const dates = rows.map((r) => r.date).sort();
      const amounts = rows.map((r) => r.amount).sort((a, b) => a - b);
      const issuer = issuers[issuerId(spec.issuerKey) - 1];
      return [
        {
          issuerId: issuer.id,
          issuerName: issuer.name,
          // The median charge, so a bill that moves month to month is described
          // by an amount some month actually carried rather than by an average
          // that matches none of them. Signed like the rows it summarises: a
          // subscription is money out.
          typicalAmount: amounts[Math.floor((amounts.length - 1) / 2)],
          frequency: spec.subscription.frequency,
          intervalDays: spec.subscription.intervalDays,
          firstChargeDate: dates[0],
          lastChargeDate: dates[dates.length - 1],
          chargeCount: rows.length,
          status: spec.subscription.status,
          transactionIds: rows.map((r) => r.id),
          detectedAt: DEMO_MADE_AT,
          updatedAt: DEMO_MADE_AT,
        },
      ];
    })
    .map((subscription, index) => ({ id: index + 1, ...subscription }));

  return { accounts, issuers, rules, transactions, subscriptions };
};
