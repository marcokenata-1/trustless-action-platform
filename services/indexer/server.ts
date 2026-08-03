import { createIndexerApp } from "./app.js";
import { loadIndexerConfig } from "./config.js";
import { IndexerListener } from "./listener/index.js";
import { IndexerRpc } from "./runtime/index.js";
import { IndexerStore } from "./store/index.js";

const config = loadIndexerConfig();
const store = new IndexerStore(config.databasePath);
const chain = new IndexerRpc(
  config.rpcUrl,
  config.verifierAddress,
  config.movementAddress,
  config.reputationAddress,
);
const listener = new IndexerListener(chain, store, config.startBlock);
const app = createIndexerApp(store, listener);

listener.startPolling(config.pollIntervalMs);

app.listen(config.port, () => {
  console.log(`Indexer listening on http://127.0.0.1:${config.port}`);
});
