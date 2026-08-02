import { createConfig, http } from "wagmi";
import { injected } from "wagmi/connectors";
import { hardhatLocal } from "./chains";

export const config = createConfig({
  chains: [hardhatLocal],
  connectors: [injected()],
  transports: {
    [hardhatLocal.id]: http(),
  },
});