import { useAccount, useConnect, useDisconnect } from "wagmi";
import { hardhatAccountAddresses } from "../lib/chains";

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

export function ConnectWallet() {
  const { address, isConnected } = useAccount();
  const { connect, connectors } = useConnect();
  const { disconnect } = useDisconnect();

  if (isConnected) {
    return (
      <div className="wallet-connected">
        <span className="wallet-address">{address}</span>
        <button className="wallet-disconnect" onClick={() => disconnect()}>
          Disconnect
        </button>
      </div>
    );
  }

  const metaMaskConnector = connectors.find((c) => c.type === "injected");
  const testAccountConnectors = connectors.filter((c) => c.type === "mock");

  return (
    <div className="wallet-connect">
      {metaMaskConnector && (
        <button
          className="wallet-connect-button"
          onClick={() => connect({ connector: metaMaskConnector })}
        >
          Connect with MetaMask
        </button>
      )}
      {metaMaskConnector && testAccountConnectors.length > 0 && (
        <span className="wallet-connect-divider">or</span>
      )}
      {testAccountConnectors.length > 0 && (
        <select
          className="wallet-connect-select"
          defaultValue=""
          onChange={(e) => {
            const connector = testAccountConnectors[Number(e.target.value)];
            if (connector) connect({ connector });
          }}
        >
          <option value="" disabled>
            Select a test account (no wallet needed)
          </option>
          {testAccountConnectors.map((connector, index) => (
            <option key={connector.uid} value={index}>
              Test Account #{index} ({shortAddress(hardhatAccountAddresses[index])})
            </option>
          ))}
        </select>
      )}
    </div>
  );
}
