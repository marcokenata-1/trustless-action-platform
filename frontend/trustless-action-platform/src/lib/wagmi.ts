import { createConfig, http } from "wagmi";
import { injected, mock } from "wagmi/connectors";
import { hardhatLocal, hardhatAccountAddresses } from "./chains";

const hasInjectedWallet = typeof window !== "undefined" && !!window.ethereum;

export const config = createConfig({
  chains: [hardhatLocal],
  connectors: [
    ...(hasInjectedWallet ? [injected({ target: "metaMask" })] : []),
    ...hardhatAccountAddresses.map((address) => mock({ accounts: [address] })),
  ],
  multiInjectedProviderDiscovery: false,
  transports: {
    [hardhatLocal.id]: http(),
  },
});