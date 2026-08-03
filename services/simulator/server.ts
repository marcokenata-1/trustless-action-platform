import { createSimulatorApp } from "./app.js";
import { loadSimulatorConfig } from "./config.js";
import { Simulator } from "./runtime/index.js";
import { HandshakeStore } from "./store/index.js";

const config = loadSimulatorConfig();
const { rpcUrl, verifierAddress, databasePath, port } = config;

const runtime = new Simulator(rpcUrl, verifierAddress);
const handshakeStore = new HandshakeStore(databasePath);
const app = createSimulatorApp(runtime, handshakeStore);

app.listen(config.port, () => {
  console.log(`Handshake simulator listening on http://127.0.0.1:${port}`);
});
