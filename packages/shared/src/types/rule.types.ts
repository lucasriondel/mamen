export type Rule = {
	id?: number;
	issuerId: number;
	pattern: string;
	matchCount: number;
	createdAt: Date;
};
