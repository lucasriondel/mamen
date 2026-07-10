export type Rule = {
	id?: number;
	issuerId: number;
	pattern: string;
	categoryOverride?: number;
	matchCount: number;
	createdAt: Date;
};
