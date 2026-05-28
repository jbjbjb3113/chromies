import { onchainTable } from "ponder";

export const tokenOwner = onchainTable("token_owner", (t) => ({
  tokenId: t.bigint().primaryKey(),
  owner: t.hex().notNull(),
  updatedAt: t.integer().notNull(),
}));

export const transferEvent = onchainTable("transfer_event", (t) => ({
  id: t.text().primaryKey(),
  tokenId: t.bigint().notNull(),
  from: t.hex().notNull(),
  to: t.hex().notNull(),
  timestamp: t.integer().notNull(),
  blockNumber: t.bigint().notNull(),
}));
