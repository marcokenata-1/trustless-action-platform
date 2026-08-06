import { useState } from "react";
import { useQuery } from "@tanstack/react-query";
import { parseEventLogs } from "viem";
import uploadMovementWiki from "../lib/ipfs";
import { useAccount, useWriteContract, usePublicClient, useReadContract } from "wagmi";
import { movementAddress, movementAbi } from "../lib/movementContract";
import { reputationAddress, reputationAbi } from "../lib/reputationContract";
import { hardhatLocal } from "../lib/chains";

export function CreateMovementForm() {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [description, setDescription] = useState("");
  const [threshold, setThreshold] = useState("4"); 
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [createdId, setCreatedId] = useState<number | null>(null);

  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  const { data: myReputation } = useReadContract({
    address: reputationAddress,
    abi: reputationAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: hardhatLocal.id,
    query: { enabled: !!address },
  });
  const { data: createRequirement } = useQuery({
    queryKey: ["create-threshold"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/movement/create`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to fetch create threshold");
      return res.json() as Promise<number>;
    },
  });

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setImageFiles(Array.from(files));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setCreatedId(null);
    setIsSubmitting(true);

    try {
      if (!address) throw new Error("Connect your wallet first");

      const manifestCid = await uploadMovementWiki(imageFiles, title, description, due);

      const dueDate = new Date(due);
      const deadlineDays = BigInt(
        Math.max(1, Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000)),
      );

      const createTxHash = await writeContractAsync({
        address: movementAddress,
        abi: movementAbi,
        functionName: "createMovement",
        args: [BigInt(threshold), deadlineDays, manifestCid],
        chainId: hardhatLocal.id,
      });

      const receipt = await publicClient!.waitForTransactionReceipt({
        hash: createTxHash,
      });
      if (receipt.status !== "success") {
        throw new Error(
          "createMovement transaction reverted — check the local hardhat node is still running the contract you expect",
        );
      }

      const [createdEvent] = parseEventLogs({
        abi: movementAbi,
        eventName: "MovementCreated",
        logs: receipt.logs,
      });
      if (!createdEvent) {
        throw new Error("MovementCreated event not found in transaction receipt");
      }
      setCreatedId(Number(createdEvent.args.movementId));
    } catch (err) {
      const message = err instanceof Error ? err.message : "";
      if (
        message.includes("reverted without a reason string") ||
        message.includes("exceeds transaction gas cap")
      ) {
        setError(
          `You need at least ${createRequirement?.toString() ?? "?"} reputation to create a movement (you have ${myReputation?.toString() ?? "0"}).`,
        );
      } else {
        setError(message || "Something went wrong");
      }
    } finally {
      setIsSubmitting(false);
    }
  }

  return (
    <form className="movement-form" onSubmit={handleSubmit}>
      <fieldset>
        <legend>Details</legend>

        <label htmlFor="movement-title">Title</label>
        <input
          id="movement-title"
          value={title}
          onChange={(e) => setTitle(e.target.value)}
          placeholder="Title"
          required
        />

        <label htmlFor="movement-due">Due</label>
        <input
          id="movement-due"
          type="datetime-local"
          value={due}
          onChange={(e) => setDue(e.target.value)}
          required
        />

        <label htmlFor="movement-description">Description</label>
        <textarea
          id="movement-description"
          value={description}
          onChange={(e) => setDescription(e.target.value)}
          placeholder="Description"
          required
        />

        <label htmlFor="movement-threshold">
          Commitments required to activate
        </label>
        <input
          id="movement-threshold"
          type="number"
          // below 4, nobody can ever hit 3 distinct peer handshakes to
          // claim attendance (AttendanceVerifier.MIN_REQUIRED_PEER_COUNT
          // is 3, and you can't count yourself as your own peer)
          min={4}
          value={threshold}
          onChange={(e) => setThreshold(e.target.value)}
          required
        />
      </fieldset>

      <fieldset>
        <legend>Media</legend>

        <label htmlFor="movement-images">Images</label>
        <input
          id="movement-images"
          type="file"
          multiple
          accept="image/*"
          onChange={handleImageChange}
        />
        {imageFiles.length > 0 && (
          <p className="file-count">{imageFiles.length} file(s) selected</p>
        )}
      </fieldset>

      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create Movement"}
      </button>
      {error && <p className="form-error">{error}</p>}
      {createdId !== null && (
        <p className="file-count">Created on-chain — movement #{createdId}</p>
      )}
    </form>
  );
}
