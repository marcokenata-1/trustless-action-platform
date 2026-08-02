import { useQuery } from "@tanstack/react-query";

export type MovementResponse = {
  id: string;
  onchain_id: number | null;
  ipfs_id: string | null;
  organizer: string;
  title: string;
  due: string;
  status: string;
};

type MovementListProps = {
  onSelect: (movement: MovementResponse) => void;
};

export function MovementList({ onSelect }: MovementListProps) {
  const { data: movements, isLoading, error } = useQuery({
    queryKey: ["movements"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/movement/`);
      if (!res.ok) throw new Error("Failed to fetch movements");
      return res.json() as Promise<MovementResponse[]>;
    },
  });

  if (isLoading) return <p className="movement-list-status">Loading movements...</p>;
  if (error) return <p className="form-error">{(error as Error).message}</p>;
  if (!movements || movements.length === 0) {
    return <p className="movement-list-status">No movements yet.</p>;
  }

  return (
    <ul className="movement-list">
      {movements.map((m) => (
        <li key={m.id} onClick={() => onSelect(m)}>
          <span className="movement-title">{m.title}</span>
          <span className="movement-status">{m.status}</span>
          <span className="movement-due">
            Due {new Date(m.due).toLocaleDateString()}
          </span>
        </li>
      ))}
    </ul>
  );
}