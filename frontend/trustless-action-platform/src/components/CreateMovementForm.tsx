import { useState } from "react";
import { parseEventLogs } from "viem";
import uploadMovementWiki from "../lib/ipfs";
import {
  useSignMessage,
  useAccount,
  useWriteContract,
  usePublicClient,
} from "wagmi";
import { movementAddress, movementAbi } from "../lib/movementContract";

export function CreateMovementForm() {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [description, setDescription] = useState("");
  const [threshold, setThreshold] = useState("3"); // just a sane default, no real basis for 3
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signMessageAsync } = useSignMessage();
  const { address } = useAccount();
  const { writeContractAsync } = useWriteContract();
  const publicClient = usePublicClient();

  function handleImageChange(e: React.ChangeEvent<HTMLInputElement>) {
    const files = e.target.files;
    if (!files) return;
    setImageFiles(Array.from(files));
  }

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setIsSubmitting(true);

    try {
      if (!address) throw new Error("Connect your wallet first");

      const manifestCid = await uploadMovementWiki(imageFiles, description);

      // contract wants deadline in days, we only have a datetime picker,
      // so just round up to whole days from now (min 1, can't backdate)
      const dueDate = new Date(due);
      const deadlineDays = BigInt(
        Math.max(1, Math.ceil((dueDate.getTime() - Date.now()) / 86_400_000)),
      );

      // has to go on-chain first since we need the real movementId back
      // before the backend row makes any sense
      const createTxHash = await writeContractAsync({
        address: movementAddress,
        abi: movementAbi,
        functionName: "createMovement",
        args: [BigInt(threshold), deadlineDays, manifestCid],
      });

      const receipt = await publicClient!.waitForTransactionReceipt({
        hash: createTxHash,
      });

      const [createdEvent] = parseEventLogs({
        abi: movementAbi,
        eventName: "MovementCreated",
        logs: receipt.logs,
      });
      const onchainId = Number(createdEvent.args.movementId);

      const message = "Sign this message to authenticate";
      const signature = await signMessageAsync({ message });

      const response = await fetch(
        `${import.meta.env.VITE_BACKEND_API_URL}/movement/create`,
        {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            address: address,
            signature: signature,
          },
          body: JSON.stringify({
            title,
            due: dueDate.toISOString(),
            ipfs_cid: manifestCid,
            address,
            signature,
            onchain_id: onchainId,
          }),
        },
      );

      if (!response.ok) {
        const errBody = await response.json();
        throw new Error(errBody.detail ?? "Failed to create movement");
      }

      // success — clear form, show confirmation, etc.
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
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
          min={1}
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
    </form>
  );
}
