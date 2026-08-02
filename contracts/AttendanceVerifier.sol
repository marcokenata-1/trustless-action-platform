// SPDX-License-Identifier: MIT
pragma solidity ^0.8.28;

import {ECDSA} from "@openzeppelin/contracts/utils/cryptography/ECDSA.sol";
import {EIP712} from "@openzeppelin/contracts/utils/cryptography/EIP712.sol";
import {IMovement} from "./interfaces/IMovement.sol";
import {IReputation} from "./interfaces/IReputation.sol";

contract AttendanceVerifier is EIP712 {
  struct HandshakeProof {
    address peer;
    bytes32 nonce;
    uint64 timestamp;
    bytes peerSignature;
  }

  struct ProofValidationResult {
    bytes32 proofsHash;
    address[] peers;
    bytes32[] handshakeDigests;
  }

  uint256 public constant MIN_REQUIRED_PEER_COUNT = 3;

  bytes32 public constant HANDSHAKE_TYPEHASH =
    keccak256(
      "Handshake(uint256 movementId,address participant,address peer,bytes32 nonce,uint64 timestamp)"
    );
  bytes32 public constant ATTENDANCE_TYPEHASH =
    keccak256(
      "Attendance(uint256 movementId,address participant,uint256 requiredPeerCount,bytes32 proofsHash)"
    );

  IMovement public immutable movement;
  IReputation public immutable reputation;
  uint256 public immutable requiredPeerCount;

  mapping(uint256 movementId => mapping(address participant => bool verified))
    public attendanceVerified;
  mapping(bytes32 handshakeDigest => bool verified) public verifiedHandshakeDigests;

  event AttendanceVerified(
    uint256 indexed movementId,
    address indexed participant,
    bytes32 indexed proofsHash,
    uint256 proofCount,
    address[] peers
  );

  error ZeroAddress();
  error InvalidRequiredPeerCount(uint256 provided);
  error MovementNotActive(uint256 movementId);
  error ParticipantNotCommitted(uint256 movementId, address participant);
  error AttendanceAlreadyVerified(uint256 movementId, address participant);
  error NotEnoughProofs(uint256 required, uint256 provided);
  error InvalidPeer(address peer);
  error ProofsNotSorted();
  error PeerNotCommitted(uint256 movementId, address peer);
  error InvalidPeerSignature(address expected, address recovered);
  error HandshakeAlreadyVerified(bytes32 handshakeDigest);
  error InvalidParticipantSignature(address expected, address recovered);

  constructor(
    address movementAddress,
    address reputationAddress,
    uint256 peerCount
  ) EIP712("TrustlessActionAttendance", "1") {
    if (movementAddress == address(0) || reputationAddress == address(0)) {
      revert ZeroAddress();
    }
    if (peerCount < MIN_REQUIRED_PEER_COUNT) {
      revert InvalidRequiredPeerCount(peerCount);
    }

    movement = IMovement(movementAddress);
    reputation = IReputation(reputationAddress);
    requiredPeerCount = peerCount;
  }

  /*
    Called once per participant per movement
  */
  function submitAttendance(
    uint256 movementId,
    address participant,
    HandshakeProof[] calldata proofs,
    bytes calldata participantSignature
  ) external {
    if (!movement.isActive(movementId)) {
      revert MovementNotActive(movementId);
    }
    if (!movement.isCommitted(movementId, participant)) {
      revert ParticipantNotCommitted(movementId, participant);
    }
    if (attendanceVerified[movementId][participant]) {
      revert AttendanceAlreadyVerified(movementId, participant);
    }
    if (proofs.length < requiredPeerCount) {
      revert NotEnoughProofs(requiredPeerCount, proofs.length);
    }

    ProofValidationResult memory validated = _validateProofs(
      movementId,
      participant,
      proofs
    );

    bytes32 attendanceStructHash = keccak256(
      abi.encode(
        ATTENDANCE_TYPEHASH,
        movementId,
        participant,
        requiredPeerCount,
        validated.proofsHash
      )
    );
    address recoveredParticipant = ECDSA.recover(
      _hashTypedDataV4(attendanceStructHash),
      participantSignature
    );
    if (recoveredParticipant != participant) {
      revert InvalidParticipantSignature(
        participant,
        recoveredParticipant
      );
    }

    attendanceVerified[movementId][participant] = true;
    for (uint256 i = 0; i < validated.handshakeDigests.length; ++i) {
      verifiedHandshakeDigests[validated.handshakeDigests[i]] = true;
    }

    reputation.rewardAttendance(participant, movementId);

    // TODO: @stephen to be listened and processed by indexer
    emit AttendanceVerified(
      movementId,
      participant,
      validated.proofsHash,
      proofs.length,
      validated.peers
    );
  }

  function _validateProofs(
    uint256 movementId,
    address participant,
    HandshakeProof[] calldata proofs
  ) private view returns (ProofValidationResult memory result) {
    result.peers = new address[](proofs.length);
    result.handshakeDigests = new bytes32[](proofs.length);
    address previousPeer;

    for (uint256 i = 0; i < proofs.length; ++i) {
      HandshakeProof calldata proof = proofs[i];

      if (proof.peer == address(0) || proof.peer == participant) {
        revert InvalidPeer(proof.peer);
      }
      if (uint160(proof.peer) <= uint160(previousPeer)) {
        revert ProofsNotSorted();
      }
      if (!movement.isCommitted(movementId, proof.peer)) {
        revert PeerNotCommitted(movementId, proof.peer);
      }

      bytes32 handshakeStructHash = keccak256(
        abi.encode(
          HANDSHAKE_TYPEHASH,
          movementId,
          participant,
          proof.peer,
          proof.nonce,
          proof.timestamp
        )
      );
      bytes32 handshakeDigest = _hashTypedDataV4(handshakeStructHash);

      if (verifiedHandshakeDigests[handshakeDigest]) {
        revert HandshakeAlreadyVerified(handshakeDigest);
      }

      address recoveredPeer = ECDSA.recover(
        handshakeDigest,
        proof.peerSignature
      );
      if (recoveredPeer != proof.peer) {
        revert InvalidPeerSignature(proof.peer, recoveredPeer);
      }

      result.peers[i] = proof.peer;
      result.handshakeDigests[i] = handshakeDigest;
      previousPeer = proof.peer;
    }

    result.proofsHash = keccak256(abi.encode(result.handshakeDigests));
  }
}
