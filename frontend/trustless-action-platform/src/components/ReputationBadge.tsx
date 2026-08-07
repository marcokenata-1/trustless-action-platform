import { useEffect, useRef, useState } from "react";
import { useAccount, useReadContract, useWriteContract } from "wagmi";
import { useQueryClient } from "@tanstack/react-query";
import { hardhatLocal } from "../lib/chains";
import { reputationAddress, reputationAbi } from "../lib/reputationContract";
import { movementAddress, movementAbi } from "../lib/movementContract";

export function ReputationBadge() {
  const { address } = useAccount();
  const queryClient = useQueryClient();
  const { writeContractAsync } = useWriteContract();
  const [isRegistering, setIsRegistering] = useState(false);
  const registeredFor = useRef<string | null>(null);

  const { data: isRegistered } = useReadContract({
    address: reputationAddress,
    abi: reputationAbi,
    functionName: "isRegistered",
    args: address ? [address] : undefined,
    chainId: hardhatLocal.id,
    query: { enabled: !!address },
  });

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

  const { data: createThreshold } = useReadContract({
    address: movementAddress,
    abi: movementAbi,
    functionName: "createRequirement",
    chainId: hardhatLocal.id,
  });

  useEffect(() => {
    if (!address || isRegistered !== false) return;
    if (registeredFor.current === address) return;
    registeredFor.current = address;
    setIsRegistering(true);
    writeContractAsync({
      address: reputationAddress,
      abi: reputationAbi,
      functionName: "register",
      chainId: hardhatLocal.id,
    })
      .then(() => queryClient.invalidateQueries())
      .catch(() => {
        registeredFor.current = null; 
      })
      .finally(() => setIsRegistering(false));
  }, [address, isRegistered, writeContractAsync, queryClient]);

  if (!address) return null;

  return (
    <div className="reputation-badge">
      <span>
        Reputation: {isRegistering ? "registering…" : (myReputation?.toString() ?? "…")}
      </span>
      <span>Avg: {averageReputation?.toString() ?? "…"}</span>
      <span>Needed to create: {createThreshold ?? "…"}</span>
    </div>
  );
}
