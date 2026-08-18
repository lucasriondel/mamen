export type Issuer = {
  id?: number;
  name: string;
  imageUrl?: string;
  defaultCategoryId?: number;
  excludedFromRecap?: boolean;
  createdAt: Date;
  firstSeen: Date;
};
