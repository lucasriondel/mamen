import createAccounts from "./0001_create_accounts";

/**
 * The migration set, keyed `NNNN_name` (the Migrator parses the numeric prefix
 * for ordering). `fromRecord` is used over `fromFileSystem` so migrations are
 * statically imported — no runtime directory scan, works identically in the Bun
 * server and the Node-run test layer. Each resource port appends its file here.
 */
export const migrations = {
	"0001_create_accounts": createAccounts,
} as const;
