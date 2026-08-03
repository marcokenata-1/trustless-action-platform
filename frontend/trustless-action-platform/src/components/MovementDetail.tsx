import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import type { MovementResponse } from "./MovementList";
import { movementAddress, movementAbi } from "../lib/movementContract";

type MovementManifest = {
  description: string;
  images: string[];
  media: string[];
};

type MovementDetailProps = {
  movement: MovementResponse;
  onBack: () => void;
};

export function MovementDetail({ movement, onBack }: MovementDetailProps) {
  const {
    data: manifest,
    isLoading,
    error,
  } = useQuery({
    queryKey: ["manifest", movement.ipfs_id],
    queryFn: async () => {
      const res = await fetch(
        `https://gateway.pinata.cloud/ipfs/${movement.ipfs_id}`,
      );
      if (!res.ok) throw new Error("Failed to fetch movement content");
      return res.json() as Promise<MovementManifest>;
    },
    enabled: !!movement.ipfs_id,
  });

  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { writeContractAsync, isPending: isJoining } = useWriteContract();

  const onchainId = movement.onchain_id;
  // reading straight from the contract here instead of asking the backend,
  // want this to be right the instant you click, not whatever the indexer
  // last saw
  const { data: isCommitted, refetch: refetchIsCommitted } = useReadContract({
    address: movementAddress,
    abi: movementAbi,
    functionName: "isCommitted",
    args:
      onchainId !== null && address ? [BigInt(onchainId), address] : undefined,
    query: { enabled: onchainId !== null && !!address },
  });

  async function handleJoin() {
    if (onchainId === null) return;
    await writeContractAsync({
      address: movementAddress,
      abi: movementAbi,
      functionName: "commit",
      args: [BigInt(onchainId)],
    });
    await refetchIsCommitted();
    await queryClient.invalidateQueries({ queryKey: ["movements"] });
  }

  return (
    <div className="movement-detail">
      <button className="movement-detail-back" onClick={onBack}>
        ← Back
      </button>

      <h2>{movement.title}</h2>
      <span className="movement-status">{movement.status}</span>
      <p className="movement-due">
        Due {new Date(movement.due).toLocaleString()}
      </p>

      {onchainId === null ? (
        <p className="movement-list-status">
          Not yet on-chain — joining isn't available for this movement.
        </p>
      ) : (
        <button
          className="movement-detail-join"
          onClick={handleJoin}
          disabled={!address || isJoining || isCommitted === true}
        >
          {isCommitted ? "Joined" : isJoining ? "Joining..." : "Join"}
        </button>
      )}

      {!movement.ipfs_id ? (
        <p className="movement-list-status">
          No content uploaded for this movement.
        </p>
      ) : isLoading ? (
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
                  src={`https://gateway.pinata.cloud/ipfs/${cid}`}
                  alt={manifest.description}
                />
              ))}
            </div>
          )}
        </>
      ) : null}
    </div>
  );
}
