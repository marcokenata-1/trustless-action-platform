import { ConnectWallet } from "./ConnectWallet";

export function AppBar() {
  return (
    <header className="appbar">
      <span className="appbar-title">Trustless Action Platform</span>
      <ConnectWallet />
    </header>
  );
}
