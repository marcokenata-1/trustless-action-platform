import { createIndexerApp } from "./app.js";
import { loadIndexerConfig } from "./config.js";
import { AttendanceListener } from "./listener/index.js";
import { IndexerRpc } from "./runtime/index.js";
import { AttendanceStore } from "./store/index.js";

const config = loadIndexerConfig();
const store = new AttendanceStore(config.databasePath);
const chain = new IndexerRpc(config.rpcUrl, config.verifierAddress);
const listener = new AttendanceListener(chain, store, config.startBlock);
const app = createIndexerApp(store, listener);

listener.startPolling(config.pollIntervalMs);

app.listen(config.port, () => {
  console.log(`Attendance indexer listening on http://127.0.0.1:${config.port}`);
});
