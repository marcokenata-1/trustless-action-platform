import { useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import "./App.css";
import { AppBar } from "./components/AppBar";
import { CreateMovementForm } from "./components/CreateMovementForm";
import { MovementList } from "./components/MovementList";
import type { MovementResponse } from "./components/MovementList";
import { MovementDetail } from "./components/MovementDetail";

type Tab = "create" | "list" | "joined";

const CREATE_REQUIREMENT_POLL_MS = 10_000;

function useCreateRequirementKeeper() {
  const queryClient = useQueryClient();
  useQuery({
    queryKey: ["create-requirement-keeper"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/movement/create`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to refresh create-requirement");
      const body = await res.json();
      queryClient.invalidateQueries({ queryKey: ["readContract"] });
      return body;
    },
    refetchInterval: CREATE_REQUIREMENT_POLL_MS,
    retry: false,
  });
}

function App() {
  const { isConnected } = useAccount();
  const [tab, setTab] = useState<Tab>("list");
  const [selectedMovement, setSelectedMovement] =
    useState<MovementResponse | null>(null);
  useCreateRequirementKeeper();

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
          className={tab === "joined" ? "active" : ""}
          onClick={() => {
            setTab("joined");
            setSelectedMovement(null);
          }}
        >
          Joined
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
        <MovementList
          onSelect={setSelectedMovement}
          filter={tab === "joined" ? "joined" : "unjoined"}
        />
      )}
    </>
  );
}

export default App;
