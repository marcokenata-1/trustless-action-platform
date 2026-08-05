import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount, useReadContract, useWriteContract, useBlock } from "wagmi";
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
  due?: string; // absent on movements created before this field existed
};

type MovementDetailProps = {
  movement: MovementResponse;
  onBack: () => void;
};

function gatewayUrl(cid: string) {
  return `https://ipfs.io/ipfs/${cid.replace(/^ipfs:\/\//, "")}`;
}

const BLOCKS_PER_DAY = 7200;
function estimateDeadlineFromBlock(
  deadlineBlock: bigint,
  createdBlock: bigint,
  createdTimestamp: bigint | undefined,
) {
  if (createdTimestamp === undefined) return null;
  const deadlineDays = (deadlineBlock - createdBlock) / BigInt(BLOCKS_PER_DAY);
  const deadlineSeconds = createdTimestamp + deadlineDays * 86_400n;
  return new Date(Number(deadlineSeconds) * 1000);
}

export function MovementDetail({ movement: initial, onBack }: MovementDetailProps) {
  const queryClient = useQueryClient();

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
  const { data: createdBlockData } = useBlock({
    blockNumber: BigInt(movement.createdBlock),
    chainId: hardhatLocal.id,
    query: { enabled: !manifest?.due },
  });
  const deadline = manifest?.due
    ? new Date(manifest.due)
    : estimateDeadlineFromBlock(
        BigInt(movement.due),
        BigInt(movement.createdBlock),
        createdBlockData?.timestamp,
      );

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
        Tally {movement.tally}/{movement.threshold} · deadline:{" "}
        {deadline
          ? `${deadline.toLocaleDateString()} ${deadline.toLocaleTimeString()}`
          : "…"}
      </p>

      <button
        className="movement-detail-join"
        onClick={handleJoin}
        // commit() now accepts joiners past threshold too — matches
        // Movement.sol, which only actually blocks on Cancelled
        disabled={!address || isJoining || isCommitted === true || movement.status === "Cancelled"}
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
