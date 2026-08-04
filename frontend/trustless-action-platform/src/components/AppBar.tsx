import { ConnectWallet } from "./ConnectWallet";
import { ReputationBadge } from "./ReputationBadge";

export function AppBar() {
  return (
    <header className="appbar">
      <span className="appbar-title">Trustless Action Platform</span>
      <div className="appbar-wallet">
        <ReputationBadge />
        <ConnectWallet />
      </div>
    </header>
  );
}
