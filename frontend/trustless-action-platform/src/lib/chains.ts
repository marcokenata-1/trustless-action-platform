import { defineChain } from "viem";
import { mnemonicToAccount } from "viem/accounts";

export const hardhatLocal = defineChain({
  id: 31337,
  name: "Hardhat Local",
  nativeCurrency: { name: "Ether", symbol: "ETH", decimals: 18 },
  rpcUrls: {
    default: { http: ["http://127.0.0.1:8545"] },
  },
});

export const LOCAL_DEV_MNEMONIC =
  "test test test test test test test test test test test junk";
export const LOCAL_ACCOUNT_COUNT = 20;
export const hardhatAccountAddresses = Array.from(
  { length: LOCAL_ACCOUNT_COUNT },
  (_, i) => mnemonicToAccount(LOCAL_DEV_MNEMONIC, { addressIndex: i }).address,
);