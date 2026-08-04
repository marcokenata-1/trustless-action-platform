import { useEffect, useRef, useState } from "react";
import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useAccount } from "wagmi";
import {
  createPublicClient,
  createWalletClient,
  encodeAbiParameters,
  getAddress,
  hashTypedData,
  http,
  keccak256,
} from "viem";
import { mnemonicToAccount } from "viem/accounts";
import { movementAddress, movementAbi } from "../lib/movementContract";
import { hardhatLocal } from "../lib/chains";
import { syncIndexer } from "../lib/indexer";

// standard hardhat/anvil dev mnemonic — same well-known local-only test
// accounts we've used via curl/scripts all session, derived properly
// instead of hand-copying private keys (error-prone, and this is provably
// correct: mnemonicToAccount(..., {addressIndex:0}) really does resolve to
// 0xf39Fd6...92266, the account #0 hardhat itself prints)
const LOCAL_DEV_MNEMONIC =
  "test test test test test test test test test test test junk";
const MAX_LOCAL_ACCOUNTS = 20;

// mirrors shared/attendance.ts — not importing it directly since that's a
// Node module outside Vite's project root (../../../shared), and this is
// small enough to keep in sync by hand rather than fight the fs boundary
const HANDSHAKE_TYPES = {
  Handshake: [
    { name: "movementId", type: "uint256" },
    { name: "participant", type: "address" },
    { name: "peer", type: "address" },
    { name: "nonce", type: "bytes32" },
    { name: "timestamp", type: "uint64" },
  ],
} as const;
const REQUIRED_PEER_COUNT = 3; // AttendanceVerifier.MIN_REQUIRED_PEER_COUNT

type HandshakeProof = {
  movementId: string;
  participant: string;
  peer: string;
  nonce: string;
  timestamp: string;
  peerSignature: string;
};

type Commit = {
  committer: string;
  tally: string;
};

type Node = {
  address: string;
  x: number;
  y: number;
  vx: number;
  vy: number;
};

type Edge = {
  a: string;
  b: string;
  proofs: [HandshakeProof, HandshakeProof];
};

const WIDTH = 480;
const HEIGHT = 260;
const REPEL = 2200;
const SPRING = 0.02;
const IDEAL_LENGTH = 120;
const CENTER_PULL = 0.01;
const DAMPING = 0.85;

function edgeKey(a: string, b: string) {
  return [a, b].sort().join("|");
}

function shortAddress(address: string) {
  return `${address.slice(0, 6)}…${address.slice(-4)}`;
}

function computeProofsHash(
  domain: { name: string; version: string; chainId: number; verifyingContract: `0x${string}` },
  proofs: HandshakeProof[],
) {
  const sorted = [...proofs].sort((a, b) => {
    const av = BigInt(getAddress(a.peer));
    const bv = BigInt(getAddress(b.peer));
    return av < bv ? -1 : av > bv ? 1 : 0;
  });
  const digests = sorted.map((p) =>
    hashTypedData({
      domain,
      types: HANDSHAKE_TYPES,
      primaryType: "Handshake",
      message: {
        movementId: BigInt(p.movementId),
        participant: getAddress(p.participant),
        peer: getAddress(p.peer),
        nonce: p.nonce as `0x${string}`,
        timestamp: BigInt(p.timestamp),
      },
    }),
  );
  return keccak256(encodeAbiParameters([{ type: "bytes32[]" }], [digests]));
}

export function HandshakeGraph({
  movementId,
  status,
}: {
  movementId: string;
  status: string;
}) {
  const { address: myAddress } = useAccount();
  const queryClient = useQueryClient();
  const [isAddingParticipant, setIsAddingParticipant] = useState(false);
  const isOpen = status === "Open";

  const { data: commits, isLoading } = useQuery({
    queryKey: ["commits", movementId],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_INDEXER_URL}/movements/${movementId}/commits`,
      );
      if (!res.ok) throw new Error("Failed to fetch commits");
      const data = (await res.json()) as { commits: Commit[] };
      return data.commits;
    },
  });

  // the simulator persists every handshake permanently (it's idempotent —
  // get-or-create) — fetch real history instead of starting empty every
  // time this page loads, so progress survives navigating away and back
  const { data: handshakeSessions } = useQuery({
    queryKey: ["handshakes", movementId],
    queryFn: async () => {
      const res = await fetch(
        `${import.meta.env.VITE_SIMULATOR_URL}/handshakes?movementId=${movementId}`,
      );
      if (!res.ok) throw new Error("Failed to fetch handshake history");
      const data = (await res.json()) as {
        sessions: { partyA: string; partyB: string; proofs: [HandshakeProof, HandshakeProof] }[];
      };
      return data.sessions;
    },
  });
  const edges: Edge[] = (handshakeSessions ?? []).map((s) => ({
    a: s.partyA,
    b: s.partyB,
    proofs: s.proofs,
  }));

  const [nodes, setNodes] = useState<Node[]>([]);
  const [selected, setSelected] = useState<string[]>([]);
  const [isSimulating, setIsSimulating] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const nodesRef = useRef<Node[]>([]);
  const edgesRef = useRef<Edge[]>([]);

  // seed nodes from real committers whenever the list changes — positions
  // start randomised, physics loop below settles them into place
  useEffect(() => {
    if (!commits) return;
    const addresses = [...new Set(commits.map((c) => c.committer))];
    setNodes((prev) => {
      const existing = new Map(prev.map((n) => [n.address, n]));
      return addresses.map(
        (address) =>
          existing.get(address) ?? {
            address,
            x: WIDTH / 2 + (Math.random() - 0.5) * 100,
            y: HEIGHT / 2 + (Math.random() - 0.5) * 100,
            vx: 0,
            vy: 0,
          },
      );
    });
  }, [commits]);

  useEffect(() => {
    nodesRef.current = nodes;
  }, [nodes]);
  useEffect(() => {
    edgesRef.current = edges;
  }, [edges]);

  // simple force-directed layout — repulsion between every pair, spring
  // along edges, mild pull to center. no library, small N, runs fine
  useEffect(() => {
    let frame: number;
    function tick() {
      const current = nodesRef.current;
      if (current.length > 0) {
        const next = current.map((n) => ({ ...n }));

        for (let i = 0; i < next.length; i++) {
          for (let j = i + 1; j < next.length; j++) {
            const a = next[i];
            const b = next[j];
            const dx = a.x - b.x;
            const dy = a.y - b.y;
            let dist = Math.sqrt(dx * dx + dy * dy) || 1;
            dist = Math.max(dist, 20);
            const force = REPEL / (dist * dist);
            const fx = (dx / dist) * force;
            const fy = (dy / dist) * force;
            a.vx += fx;
            a.vy += fy;
            b.vx -= fx;
            b.vy -= fy;
          }
        }

        for (const edge of edgesRef.current) {
          const a = next.find((n) => n.address === edge.a);
          const b = next.find((n) => n.address === edge.b);
          if (!a || !b) continue;
          const dx = b.x - a.x;
          const dy = b.y - a.y;
          const dist = Math.sqrt(dx * dx + dy * dy) || 1;
          const force = SPRING * (dist - IDEAL_LENGTH);
          const fx = (dx / dist) * force;
          const fy = (dy / dist) * force;
          a.vx += fx;
          a.vy += fy;
          b.vx -= fx;
          b.vy -= fy;
        }

        let totalSpeed = 0;
        for (const n of next) {
          n.vx += (WIDTH / 2 - n.x) * CENTER_PULL;
          n.vy += (HEIGHT / 2 - n.y) * CENTER_PULL;
          n.vx *= DAMPING;
          n.vy *= DAMPING;
          n.x = Math.min(WIDTH - 20, Math.max(20, n.x + n.vx));
          n.y = Math.min(HEIGHT - 20, Math.max(20, n.y + n.vy));
          totalSpeed += Math.abs(n.vx) + Math.abs(n.vy);
        }

        // stop nudging positions once the layout has basically settled —
        // otherwise nodes keep drifting forever (CENTER_PULL never hits
        // exactly zero) and a second click can miss a node that's moved
        // since the first click
        if (totalSpeed > 0.05) {
          setNodes(next);
        }
      }
      frame = requestAnimationFrame(tick);
    }
    frame = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(frame);
  }, []);

  function toggleSelect(address: string) {
    setError(null);
    setSelected((prev) => {
      if (prev.includes(address)) return prev.filter((a) => a !== address);
      if (prev.length >= 2) return [prev[1], address]; // swap out the older pick
      return [...prev, address];
    });
  }

  const alreadyConnected =
    selected.length === 2 &&
    edges.some((e) => edgeKey(e.a, e.b) === edgeKey(selected[0], selected[1]));

  async function shakeHands() {
    if (selected.length !== 2 || alreadyConnected) return;
    setError(null);
    setIsSimulating(true);
    try {
      const res = await fetch(`${import.meta.env.VITE_SIMULATOR_URL}/simulate/handshake`, {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({
          movementId,
          partyA: selected[0],
          partyB: selected[1],
        }),
      });
      const body = await res.json();
      if (!res.ok) throw new Error(body.error ?? "Handshake simulation failed");
      await queryClient.invalidateQueries({ queryKey: ["handshakes", movementId] });
      setSelected([]);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsSimulating(false);
    }
  }

  async function addParticipant() {
    setError(null);
    if (!isOpen) {
      setError(
        `Movement is ${status}, not Open — no more participants can join.`,
      );
      return;
    }

    setIsAddingParticipant(true);
    try {
      const publicClient = createPublicClient({
        chain: hardhatLocal,
        transport: http(),
      });

      // check the chain directly, not the indexer's cached commit list —
      // that can lag a click or two behind reality (e.g. right after a
      // previous add), and picking an already-committed account here
      // means a guaranteed revert instead of a clean "all full" message
      let account = null;
      for (let i = 0; i < MAX_LOCAL_ACCOUNTS; i++) {
        const candidate = mnemonicToAccount(LOCAL_DEV_MNEMONIC, { addressIndex: i });
        const alreadyCommitted = await publicClient.readContract({
          address: movementAddress,
          abi: movementAbi,
          functionName: "isCommitted",
          args: [BigInt(movementId), candidate.address],
        });
        if (!alreadyCommitted) {
          account = candidate;
          break;
        }
      }
      if (!account) {
        setError("All local test accounts have already joined this movement.");
        return;
      }

      const walletClient = createWalletClient({
        account,
        chain: hardhatLocal,
        transport: http(),
      });
      const hash = await walletClient.writeContract({
        address: movementAddress,
        abi: movementAbi,
        functionName: "commit",
        args: [BigInt(movementId)],
      });
      const receipt = await publicClient.waitForTransactionReceipt({ hash });
      if (receipt.status !== "success") {
        throw new Error("commit() reverted — movement may no longer be Open");
      }
      await syncIndexer();
      await queryClient.invalidateQueries({ queryKey: ["commits", movementId] });
      await queryClient.invalidateQueries({ queryKey: ["movement", movementId] });
      await queryClient.invalidateQueries({ queryKey: ["movements"] });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Something went wrong");
    } finally {
      setIsAddingParticipant(false);
    }
  }

  // works for any address, not just the connected wallet — each node's
  // own proof from each edge it's part of, since that's what actually
  // feeds an attendance submission, not the edge itself
  function proofsFor(address: string): HandshakeProof[] {
    return edges
      .filter((e) => e.a === address || e.b === address)
      .map((e) => e.proofs.find((p) => getAddress(p.participant) === getAddress(address)))
      .filter((p): p is HandshakeProof => !!p);
  }

  function attendanceStatusFor(address: string) {
    const proofs = proofsFor(address);
    if (proofs.length < REQUIRED_PEER_COUNT) {
      return { address, proofs, proof: null };
    }
    return {
      address,
      proofs,
      proof: {
        proofsHash: computeProofsHash(
          {
            name: "TrustlessActionAttendance",
            version: "1",
            chainId: 31337,
            verifyingContract: import.meta.env.VITE_ATTENDANCE_VERIFIER_ADDRESS,
          },
          proofs,
        ),
        peers: proofs.map((p) => p.peer),
      },
    };
  }

  // inspecting a clicked node shows THAT node's progress, not yours —
  // only fall back to your own wallet when nothing is selected
  const inspecting =
    selected.length > 0
      ? selected.map(attendanceStatusFor)
      : myAddress
        ? [attendanceStatusFor(myAddress)]
        : [];

  if (isLoading) return <p className="movement-list-status">Loading participants...</p>;
  if (!commits || commits.length < 2) {
    return (
      <div className="handshake-graph">
        <h3>Attendance handshake mesh</h3>
        <p className="movement-list-status">
          Waiting for at least one more person to join — there's no one to
          handshake with yet.
        </p>
        <button
          className="movement-detail-join"
          onClick={addParticipant}
          disabled={isAddingParticipant}
        >
          {isAddingParticipant ? "Joining..." : "+ Add Participant"}
        </button>
        {error && <p className="form-error">{error}</p>}
      </div>
    );
  }

  return (
    <div className="handshake-graph">
      <h3>Attendance handshake mesh</h3>
      <p className="movement-list-status">
        {selected.length === 0
          ? "Click two nodes to shake hands."
          : selected.length === 1
            ? "Pick one more node."
            : alreadyConnected
              ? "Already shaken hands — pick a different pair."
              : "Ready — shake hands?"}
      </p>
      <svg viewBox={`0 0 ${WIDTH} ${HEIGHT}`} width="100%" height={HEIGHT}>
        {edges.map((edge) => {
          const a = nodes.find((n) => n.address === edge.a);
          const b = nodes.find((n) => n.address === edge.b);
          if (!a || !b) return null;
          return (
            <line
              key={edgeKey(edge.a, edge.b)}
              x1={a.x}
              y1={a.y}
              x2={b.x}
              y2={b.y}
              className="handshake-edge"
            />
          );
        })}
        {nodes.map((n) => {
          const isMe = n.address === myAddress;
          const isSelected = selected.includes(n.address);
          return (
            <g key={n.address} onClick={() => toggleSelect(n.address)} style={{ cursor: "pointer" }}>
              <circle
                cx={n.x}
                cy={n.y}
                r={isSelected ? 13 : 10}
                className={
                  isSelected
                    ? "handshake-node handshake-node-selected"
                    : isMe
                      ? "handshake-node handshake-node-me"
                      : "handshake-node"
                }
              />
              <text x={n.x} y={n.y + 24} textAnchor="middle" className="handshake-label">
                {shortAddress(n.address)}
                {isMe ? " (you)" : ""}
              </text>
            </g>
          );
        })}
      </svg>
      <button
        className="movement-detail-join"
        onClick={shakeHands}
        disabled={isSimulating || selected.length !== 2 || alreadyConnected}
      >
        {isSimulating ? "Simulating..." : "Shake Hands"}
      </button>{" "}
      <button
        className="movement-detail-join"
        onClick={addParticipant}
        disabled={isAddingParticipant}
        title={!isOpen ? `Movement is ${status}, not Open` : undefined}
      >
        {isAddingParticipant ? "Joining..." : "+ Add Participant"}
      </button>
      {error && <p className="form-error">{error}</p>}

      {inspecting.map(({ address, proofs, proof }) => (
        <div key={address}>
          <p className="movement-list-status">
            {address === myAddress ? "Your proofs" : shortAddress(address)}:{" "}
            {proofs.length}/{REQUIRED_PEER_COUNT} needed for attendance
          </p>
          {proof && (
            <div className="attendance-proof">
              <h3>Proof of attendance</h3>
              <p className="movement-due">Participant: {address}</p>
              <p className="movement-due">
                Peers: {proof.peers.map(shortAddress).join(", ")}
              </p>
              <p className="movement-due" style={{ wordBreak: "break-all" }}>
                proofsHash: {proof.proofsHash}
              </p>
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
