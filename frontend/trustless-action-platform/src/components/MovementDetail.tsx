import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import type { MovementResponse } from "./MovementList";
import { movementAddress, movementAbi } from "../lib/movementContract";
import { hardhatLocal } from "../lib/chains";
import { HandshakeGraph } from "./HandshakeGraph";
import { syncIndexer } from "../lib/indexer";

type MovementManifest = {
  title: string;
  description: string;
  images: string[];
  media: string[];
};

type MovementDetailProps = {
  movement: MovementResponse;
  onBack: () => void;
};

function gatewayUrl(cid: string) {
  return `https://ipfs.io/ipfs/${cid.replace(/^ipfs:\/\//, "")}`;
}

export function MovementDetail({ movement: initial, onBack }: MovementDetailProps) {
  const queryClient = useQueryClient();

  // the prop is a snapshot from whenever this movement was selected from
  // the list — invalidating ["movements"] elsewhere doesn't touch it, so
  // tally/status here would go stale after joining/adding participants.
  // fetch this one movement live instead, falling back to the snapshot
  // only for the very first paint
  const { data: live } = useQuery({
    queryKey: ["movement", initial.movementId],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_INDEXER_URL}/movements/${initial.movementId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch movement");
      const data = (await res.json()) as { movement: MovementResponse };
      return data.movement;
    },
  });
  const movement = live ?? initial;

  const {
    data: manifest,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["manifest", movement.cid],
    queryFn: async () => {
      const res = await fetch(gatewayUrl(movement.cid));
      if (!res.ok) throw new Error("Failed to fetch movement content");
      return res.json() as Promise<MovementManifest>;
    },
    retry: false,
  });

  const { address } = useAccount();
  const { writeContractAsync, isPending: isJoining } = useWriteContract();

  const onchainId = BigInt(movement.movementId);
  const { data: isCommitted, refetch: refetchIsCommitted } = useReadContract({
    address: movementAddress,
    abi: movementAbi,
    functionName: "isCommitted",
    args: address ? [onchainId, address] : undefined,
    chainId: hardhatLocal.id,
    query: { enabled: !!address },
  });

  async function handleJoin() {
    await writeContractAsync({
      address: movementAddress,
      abi: movementAbi,
      functionName: "commit",
      args: [onchainId],
      chainId: hardhatLocal.id,
    });
    await refetchIsCommitted();
    await syncIndexer();
    await queryClient.invalidateQueries({ queryKey: ["movement", movement.movementId] });
    await queryClient.invalidateQueries({ queryKey: ["movements"] });
  }

  return (
    <div className="movement-detail">
      <button className="movement-detail-back" onClick={onBack}>
        ← Back
      </button>

      <h2>{manifest?.title ?? `Movement #${movement.movementId}`}</h2>
      <span className="movement-status">
        {isCommitted && movement.status === "Open" ? "Committed" : movement.status}
      </span>
      <p className="movement-due">
        Tally {movement.tally}/{movement.threshold} · deadline: block #
        {Number(movement.due).toLocaleString()}
      </p>

      <button
        className="movement-detail-join"
        onClick={handleJoin}
        disabled={!address || isJoining || isCommitted === true || movement.status !== "Open"}
      >
        {isCommitted ? "Joined" : isJoining ? "Joining..." : "Join"}
      </button>

      {isLoading ? (
        <p className="movement-list-status">Loading content...</p>
      ) : error ? (
        <p className="form-error">{(error as Error).message}</p>
      ) : manifest ? (
        <>
          <p>{manifest.description}</p>
          {manifest.images.length > 0 && (
            <div className="movement-detail-images">
              {manifest.images.map((cid) => (
                <img
                  key={cid}
                  src={gatewayUrl(cid)}
                  alt={manifest.description}
                />
              ))}
            </div>
          )}
        </>
      ) : null}

      {isCommitted && (
        <HandshakeGraph movementId={movement.movementId} status={movement.status} />
      )}
    </div>
  );
}
