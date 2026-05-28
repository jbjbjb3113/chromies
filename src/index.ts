import { ponder } from "ponder:registry";
import { tokenOwner, transferEvent } from "ponder:schema";

const ZERO_ADDRESS = "0x0000000000000000000000000000000000000000";

ponder.on("Chroma:Transfer", async ({ event, context }: any) => {
  await context.db.insert(transferEvent).values({
    id: event.id,
    tokenId: event.args.tokenId,
    from: event.args.from,
    to: event.args.to,
    timestamp: Number(event.block.timestamp),
    blockNumber: event.block.number,
  });

  if (event.args.to.toLowerCase() === ZERO_ADDRESS) {
    await context.db.delete(tokenOwner, { tokenId: event.args.tokenId });
    return;
  }

  await context.db
    .insert(tokenOwner)
    .values({
      tokenId: event.args.tokenId,
      owner: event.args.to,
      updatedAt: Number(event.block.timestamp),
    })
    .onConflictDoUpdate({
      owner: event.args.to,
      updatedAt: Number(event.block.timestamp),
    });
});
