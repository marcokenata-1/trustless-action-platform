import { useState } from "react";
import { useAccount } from "wagmi";
import "./App.css";
import { AppBar } from "./components/AppBar";
import { CreateMovementForm } from "./components/CreateMovementForm";
import { MovementList } from "./components/MovementList";

type Tab = "create" | "list";

function App() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("create");

  return (
    <>
      <AppBar />
      <nav className="tabs">
        <button
          className={tab === "create" ? "active" : ""}
          onClick={() => setTab("create")}
        >
          Create Movement
        </button>
        <button
          className={tab === "list" ? "active" : ""}
          onClick={() => setTab("list")}
        >
          Movements
        </button>
      </nav>

      {tab === "create" ? (
        isConnected ? (
          <CreateMovementForm />
        ) : (
          <p className="connect-prompt">
            Connect your wallet to create a movement.
          </p>
        )
      ) : (
        <MovementList />
      )}
    </>
  );
}

export default App;
