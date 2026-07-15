import { SqlClient } from "@effect/sql";
import { Effect } from "effect";

/**
 * Seeds the base two-level category tree (PRD #8, issue #21) on a fresh
 * database — 6 **Category folders**, each holding its **Category leaves**, drawn
 * from the live database's real spending. *Uncategorised* is seeded deliberately:
 * it is the escape hatch the override model depends on later.
 *
 * A **one-shot migration**, not a boot-time write: seeded categories are
 * *starting data, not schema*. The user may rename, re-parent or delete any of
 * it and nothing ever restores it — the migrator records this migration as
 * applied, so a second boot never re-inserts (which is why `slug` needs no
 * unique constraint here). Changing the base list for future databases means a
 * new migration, never a boot-time reconcile.
 */

/** A leaf's own name/slug/icon; it inherits its folder's colour. */
type Leaf = { name: string; slug: string; icon: string };

/** A folder plus the leaves that sit beneath it. */
type Folder = {
	name: string;
	slug: string;
	color: string;
	icon: string;
	leaves: Leaf[];
};

/**
 * The seeded tree (PRD #8). Folders order top-to-bottom; leaves order within
 * their folder. *Cafés* splits from *Restaurants* (a distinct recurring coffee
 * habit in the data); *Transfers* houses money moved to the user's own account
 * (not spending); *Income & Other* is one folder so *Other* is not left holding
 * only *Uncategorised*.
 */
const TREE: readonly Folder[] = [
	{
		name: "Food",
		slug: "food",
		color: "#ef4444",
		icon: "🍔",
		leaves: [
			{ name: "Groceries", slug: "groceries", icon: "🛒" },
			{ name: "Restaurants", slug: "restaurants", icon: "🍽️" },
			{ name: "Cafés", slug: "cafes", icon: "☕" },
		],
	},
	{
		name: "Home",
		slug: "home",
		color: "#f97316",
		icon: "🏠",
		leaves: [
			{ name: "Rent", slug: "rent", icon: "🔑" },
			{ name: "Energy", slug: "energy", icon: "⚡" },
			{ name: "Insurance", slug: "insurance", icon: "🛡️" },
			{ name: "Internet & Phone", slug: "internet-phone", icon: "📶" },
		],
	},
	{
		name: "Transport",
		slug: "transport",
		color: "#eab308",
		icon: "🚗",
		leaves: [
			{ name: "Fuel & Charging", slug: "fuel-charging", icon: "⛽" },
			{ name: "Transit", slug: "transit", icon: "🚆" },
			{ name: "Vehicle", slug: "vehicle", icon: "🔧" },
		],
	},
	{
		name: "Life",
		slug: "life",
		color: "#22c55e",
		icon: "💫",
		leaves: [
			{ name: "Health", slug: "health", icon: "🩺" },
			{ name: "Pets", slug: "pets", icon: "🐾" },
			{ name: "Shopping", slug: "shopping", icon: "🛍️" },
			{ name: "Subscriptions", slug: "subscriptions", icon: "🔁" },
			{ name: "Gifts & Donations", slug: "gifts-donations", icon: "🎁" },
		],
	},
	{
		name: "Leisure",
		slug: "leisure",
		color: "#3b82f6",
		icon: "🎉",
		leaves: [
			{ name: "Events", slug: "events", icon: "🎫" },
			{ name: "Travel", slug: "travel", icon: "✈️" },
		],
	},
	{
		name: "Income & Other",
		slug: "income-other",
		color: "#8b5cf6",
		icon: "💰",
		leaves: [
			{ name: "Salary", slug: "salary", icon: "💵" },
			{ name: "Taxes", slug: "taxes", icon: "🧾" },
			{ name: "Transfers", slug: "transfers", icon: "🔄" },
			{ name: "Uncategorised", slug: "uncategorised", icon: "❓" },
		],
	},
];

export default Effect.flatMap(SqlClient.SqlClient, (sql) =>
	Effect.gen(function* () {
		const now = new Date().toISOString();

		for (const [folderOrder, folder] of TREE.entries()) {
			const inserted = yield* sql`INSERT INTO categories ${sql.insert({
				name: folder.name,
				slug: folder.slug,
				color: folder.color,
				icon: folder.icon,
				parentId: null,
				sortOrder: folderOrder,
				createdAt: now,
			})} RETURNING id`;
			const parentId = (inserted[0] as { id: number }).id;

			for (const [leafOrder, leaf] of folder.leaves.entries()) {
				yield* sql`INSERT INTO categories ${sql.insert({
					name: leaf.name,
					slug: leaf.slug,
					color: folder.color,
					icon: leaf.icon,
					parentId,
					sortOrder: leafOrder,
					createdAt: now,
				})}`;
			}
		}
	}),
);
