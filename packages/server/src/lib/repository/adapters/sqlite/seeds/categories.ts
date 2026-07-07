import type { Database } from "bun:sqlite";

type CategorySeed = {
	name: string;
	color: string;
	icon: string;
	subcategories: string[];
};

const DEFAULT_CATEGORIES: CategorySeed[] = [
	{
		name: "Shopping",
		color: "#3B82F6",
		icon: "ShoppingCart",
		subcategories: ["Online", "Groceries", "Clothing", "Electronics", "Other"],
	},
	{
		name: "Dining",
		color: "#F97316",
		icon: "Utensils",
		subcategories: ["Restaurants", "Coffee", "Fast Food", "Delivery"],
	},
	{
		name: "Transportation",
		color: "#06B6D4",
		icon: "Car",
		subcategories: ["Rideshare", "Public Transit", "Gas", "Parking"],
	},
	{
		name: "Subscriptions",
		color: "#8B5CF6",
		icon: "Repeat",
		subcategories: ["Streaming", "Software", "Memberships"],
	},
	{
		name: "Housing",
		color: "#64748B",
		icon: "Home",
		subcategories: ["Rent", "Utilities", "Insurance", "Maintenance"],
	},
	{
		name: "Health",
		color: "#EF4444",
		icon: "Heart",
		subcategories: ["Medical", "Pharmacy", "Fitness"],
	},
	{
		name: "Entertainment",
		color: "#EC4899",
		icon: "Gamepad2",
		subcategories: ["Events", "Games", "Hobbies"],
	},
	{
		name: "Travel",
		color: "#22C55E",
		icon: "Plane",
		subcategories: ["Flights", "Hotels", "Activities"],
	},
	{
		name: "Income",
		color: "#10B981",
		icon: "TrendingUp",
		subcategories: ["Salary", "Freelance", "Refunds", "Other"],
	},
	{
		name: "Other",
		color: "#6B7280",
		icon: "MoreHorizontal",
		subcategories: ["Uncategorized"],
	},
];

const toSlug = (name: string): string =>
	name.toLowerCase().replace(/\s+/g, "-");

export const seedCategories = (db: Database): void => {
	const count = db
		.query<{ cnt: number }, []>("SELECT COUNT(*) as cnt FROM categories")
		.get()!.cnt;

	if (count > 0) return;

	const now = new Date().toISOString();
	const insertStmt = db.prepare(
		"INSERT INTO categories (name, slug, color, icon, parentId, sortOrder, createdAt) VALUES (?, ?, ?, ?, ?, ?, ?) RETURNING id",
	);

	const tx = db.transaction(() => {
		const parentIds: number[] = [];

		for (const [i, parent] of DEFAULT_CATEGORIES.entries()) {
			const row = insertStmt.get(
				parent.name,
				toSlug(parent.name),
				parent.color,
				parent.icon,
				null,
				i,
				now,
			) as { id: number };
			parentIds.push(row.id);
		}

		for (const [i, parent] of DEFAULT_CATEGORIES.entries()) {
			const parentId = parentIds[i];
			for (const [j, subName] of parent.subcategories.entries()) {
				insertStmt.get(
					subName,
					`${toSlug(parent.name)}-${toSlug(subName)}`,
					parent.color,
					parent.icon,
					parentId,
					j,
					now,
				);
			}
		}
	});

	tx();
};
