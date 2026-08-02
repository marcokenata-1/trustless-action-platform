import { useAccount } from "wagmi";
import "./App.css";
import { AppBar } from "./components/AppBar";
import { CreateMovementForm } from "./components/CreateMovementForm";

function App() {
  const { isConnected } = useAccount();

  return (
    <>
      <AppBar />
      {isConnected ? (
        <CreateMovementForm />
      ) : (
        <p className="connect-prompt">
          Connect your wallet to create a movement.
        </p>
      )}
    </>
  );
}

export default App;
