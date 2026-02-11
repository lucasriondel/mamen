export type UnitOfWork = {
	run: <T>(fn: () => Promise<T>) => Promise<T>;
};
