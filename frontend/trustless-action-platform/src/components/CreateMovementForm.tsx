import { useState } from "react";
import uploadMovementWiki from "../lib/ipfs";
import { useSignMessage, useAccount } from "wagmi";

export function CreateMovementForm() {
  const [title, setTitle] = useState("");
  const [due, setDue] = useState("");
  const [description, setDescription] = useState("");
  const [imageFiles, setImageFiles] = useState<File[]>([]);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const { signMessageAsync } = useSignMessage();
  const { address } = useAccount();

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
            due: new Date(due).toISOString(),
            ipfs_cid: manifestCid,
            address,
            signature,
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
    <form onSubmit={handleSubmit}>
      <input
        value={title}
        onChange={(e) => setTitle(e.target.value)}
        placeholder="Title"
        required
      />
      <input
        type="datetime-local"
        value={due}
        onChange={(e) => setDue(e.target.value)}
        required
      />
      <textarea
        value={description}
        onChange={(e) => setDescription(e.target.value)}
        placeholder="Description"
        required
      />
      <input
        type="file"
        multiple
        accept="image/*"
        onChange={handleImageChange}
      />
      <button type="submit" disabled={isSubmitting}>
        {isSubmitting ? "Creating..." : "Create Movement"}
      </button>
      {error && <p style={{ color: "red" }}>{error}</p>}
    </form>
  );
}
