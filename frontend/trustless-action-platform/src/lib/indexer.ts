// indexer only polls the chain every INDEXER_POLL_INTERVAL_MS on its own —
// call this right after our own tx confirms so a refetch right afterward
// doesn't race the indexer's background poll and return stale data
export async function syncIndexer() {
  await fetch(`${import.meta.env.VITE_INDEXER_URL}/sync`, { method: "POST" });
}
