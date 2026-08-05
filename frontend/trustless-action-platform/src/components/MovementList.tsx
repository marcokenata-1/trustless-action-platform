import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContracts } from "wagmi";
import { movementAddress, movementAbi } from "../lib/movementContract";
import { hardhatLocal } from "../lib/chains";


export type MovementResponse = {
  movementId: string;
  organiser: string;
  threshold: string;
  cid: string;
  due: string;
  status: string;
  tally: string;
  createdBlock: number;
};

function displayStatus(status: string, filter: "all" | "joined" | "unjoined") {
  if (filter === "joined" && status === "Open") return "Committed";
  return status;
}

type MovementListProps = {
  onSelect: (movement: MovementResponse) => void;
  filter?: "all" | "joined" | "unjoined";
};

export function MovementList({
  onSelect,
  filter = "all",
}: MovementListProps) {
  const { address } = useAccount();
  const needsCommittedCheck = filter !== "all";

  const {
    data: movements,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_INDEXER_URL}/movements`);
      if (!res.ok) throw new Error("Failed to fetch movements");
      const data = (await res.json()) as { movements: MovementResponse[] };
      return data.movements;
    },
  });

  const { data: committedResults, isLoading: isLoadingCommitted } =
    useReadContracts({
      contracts: (movements ?? []).map((m) => ({
        address: movementAddress,
        abi: movementAbi,
        functionName: "isCommitted",
        args: [BigInt(m.movementId), address!],
        chainId: hardhatLocal.id,
      })),
      query: {
        enabled: needsCommittedCheck && !!address && !!movements?.length,
      },
    });

  if (isLoading || (needsCommittedCheck && !!address && isLoadingCommitted))
    return <p className="movement-list-status">Loading movements...</p>;
  if (error) return <p className="form-error">{(error as Error).message}</p>;
  if (filter === "joined" && !address) {
    return (
      <p className="movement-list-status">
        Connect your wallet to see movements you've joined.
      </p>
    );
  }

  const visible =
    !needsCommittedCheck || !address
      ? (movements ?? [])
      : (movements ?? []).filter((_, i) => {
          const committed =
            (committedResults?.[i]?.result as boolean | undefined) === true;
          return filter === "joined" ? committed : !committed;
        });

  if (visible.length === 0) {
    return (
      <p className="movement-list-status">
        {filter === "joined"
          ? "You haven't joined any movements yet."
          : "No movements yet."}
      </p>
    );
  }

  return (
    <ul className="movement-list">
      {visible.map((m) => (
        <li key={m.movementId} onClick={() => onSelect(m)}>
          <span className="movement-title">Movement #{m.movementId}</span>
          <span className="movement-status">{displayStatus(m.status, filter)}</span>
          <span className="movement-due">
            Tally {m.tally}/{m.threshold}
          </span>
        </li>
      ))}
    </ul>
  );
}
