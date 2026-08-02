import { useQuery } from "@tanstack/react-query";
import type { MovementResponse } from "./MovementList";

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
  const { data: manifest, isLoading, error } = useQuery({
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
