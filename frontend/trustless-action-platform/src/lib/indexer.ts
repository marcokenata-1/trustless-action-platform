export async function syncIndexer() {
  await fetch(`${import.meta.env.VITE_INDEXER_URL}/sync`, { method: "POST" });
}
