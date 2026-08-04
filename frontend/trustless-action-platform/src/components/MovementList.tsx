import { useQuery } from "@tanstack/react-query";
import { useAccount, useReadContracts } from "wagmi";
import { movementAddress, movementAbi } from "../lib/movementContract";
import { hardhatLocal } from "../lib/chains";

// matches services/indexer/store/indexerStore.ts's StoredMovement shape —
// this IS the on-chain movement now, no separate DB row to keep in sync
export type MovementResponse = {
  movementId: string;
  organiser: string;
  threshold: string;
  cid: string;
  due: string; 
  status: string;
  tally: string;
};

// on-chain Status enum is only Open/Activated/Cancelled — "Committed" isn't
// a real movement state, it's "you personally joined an Open one," so it
// only makes sense to show on the joined tab, and only while still Open
function displayStatus(status: string, filter: "all" | "joined" | "unjoined") {
  if (filter === "joined" && status === "Open") return "Committed";
  return status;
}

type MovementListProps = {
  onSelect: (movement: MovementResponse) => void;
  // "all" everywhere by default, "joined"/"unjoined" split the same list
  // in half instead of overlapping — joining something moves it between tabs
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

  // one isCommitted read per movement, batched into a single multicall —
  // only needed when splitting by joined/unjoined
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

  // no wallet connected and we're just excluding joined ones — nothing to
  // exclude yet, so show everything rather than blocking browsing
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
        // no title here on purpose — that'd mean fetching every movement's
        // IPFS content just to render the list. real title shows up once
        // you're in the detail view, which already fetches it anyway
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
