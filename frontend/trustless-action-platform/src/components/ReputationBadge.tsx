import { useAccount, useReadContract } from "wagmi";
import { hardhatLocal } from "../lib/chains";
import { reputationAddress, reputationAbi } from "../lib/reputationContract";
import { movementAddress, movementAbi } from "../lib/movementContract";

// shows the numbers the reputation system actually gates on — your balance,
// the network average, and the threshold that gets pushed by Vedro's keeper
// (Movement.createRequirement, kept in sync with averageReputation)
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

  const { data: createRequirement } = useReadContract({
    address: movementAddress,
    abi: movementAbi,
    functionName: "createRequirement",
    chainId: hardhatLocal.id,
  });

  if (!address) return null;

  return (
    <div className="reputation-badge">
      <span>Reputation: {myReputation?.toString() ?? "…"}</span>
      <span>Avg: {averageReputation?.toString() ?? "…"}</span>
      <span>Needed to create: {createRequirement?.toString() ?? "…"}</span>
    </div>
  );
}
