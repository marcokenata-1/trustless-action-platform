import { useState } from "react";
import { useAccount } from "wagmi";
import "./App.css";
import { AppBar } from "./components/AppBar";
import { CreateMovementForm } from "./components/CreateMovementForm";
import { MovementList } from "./components/MovementList";
import type { MovementResponse } from "./components/MovementList";
import { MovementDetail } from "./components/MovementDetail";

type Tab = "create" | "list";

function App() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("list");
  const [selectedMovement, setSelectedMovement] =
    useState<MovementResponse | null>(null);

  return (
    <>
      <AppBar />
      <nav className="tabs">
        <button
          className={tab === "list" ? "active" : ""}
          onClick={() => {
            setTab("list");
            setSelectedMovement(null);
          }}
        >
          Movements
        </button>
        <button
          className={tab === "create" ? "active" : ""}
          onClick={() => setTab("create")}
        >
          Create Movement
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
      ) : selectedMovement ? (
        <MovementDetail
          movement={selectedMovement}
          onBack={() => setSelectedMovement(null)}
        />
      ) : (
        <MovementList onSelect={setSelectedMovement} />
      )}
    </>
  );
}

export default App;
