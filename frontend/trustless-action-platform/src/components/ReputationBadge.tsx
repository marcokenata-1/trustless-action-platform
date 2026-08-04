import { useAccount, useReadContract } from "wagmi";
import { useQuery } from "@tanstack/react-query";
import { hardhatLocal } from "../lib/chains";
import { reputationAddress, reputationAbi } from "../lib/reputationContract";

// shows the numbers the reputation system gates on — your balance, the
// network average (straight off-chain), and the create-movement threshold,
// which comes from the backend's dynamic formula, not the on-chain keeper
// approach tried first
export function ReputationBadge() {
  const { address } = useAccount();

  const { data: myReputation } = useReadContract({
    address: reputationAddress,
    abi: reputationAbi,
    functionName: "balanceOf",
    args: address ? [address] : undefined,
    chainId: hardhatLocal.id,
    query: { enabled: !!address },
  });

  const { data: averageReputation } = useReadContract({
    address: reputationAddress,
    abi: reputationAbi,
    functionName: "averageReputation",
    chainId: hardhatLocal.id,
  });

  const { data: createThreshold } = useQuery({
    queryKey: ["create-threshold"],
    queryFn: async () => {
      const res = await fetch(`${import.meta.env.VITE_BACKEND_API_URL}/movement/create`, {
        method: "POST",
      });
      if (!res.ok) throw new Error("Failed to fetch create threshold");
      return res.json() as Promise<number>;
    },
  });

  if (!address) return null;

  return (
    <div className="reputation-badge">
      <span>Reputation: {myReputation?.toString() ?? "…"}</span>
      <span>Avg: {averageReputation?.toString() ?? "…"}</span>
      <span>Needed to create: {createThreshold ?? "…"}</span>
    </div>
  );
}
