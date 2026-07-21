// SPDX-License-Identifier: MIT
pragma solidity ^0.8.35;

interface IReputation {
    function balanceOf(address user) external view returns (uint256);
}
contract Movement {

    enum Status{Open, Activated, Cancelled}

    struct MovementData {
        address organiserAddress;
        uint256 threshold;
        uint256 deadlineBlock;
        string ipfsCID;
        uint256 currentTally;
        Status status;
    }

    IReputation public immutable reputation;

    address public requirementUpdater;

    uint256 public createRequirement;

    uint256 private nextMovementId;

    mapping(uint256 => MovementData) private movements;
    mapping(uint256 => mapping(address => bool)) private committed;
    mapping(uint256 => address[]) private committers;

    event MovementCreated(
        uint256 indexed movementId,
        address indexed organiser,
        uint256 threshold,
        uint256 deadlineBlock,
        string cid
    );
    event Committed(uint256 indexed movementId, address indexed committer, uint256 tally);
    event MovementActivated(uint256 indexed movementId);
    event MovementCancelled(uint256 indexed movementId);
    event CreateRequirementUpdated(uint256 oldRequirement, uint256 newRequirement);

    constructor(address reputationAddress, address requirementUpdaterAddress, uint256 initialCreateRequirement) {
        reputation = IReputation(reputationAddress);
        requirementUpdater = requirementUpdaterAddress;
        createRequirement = initialCreateRequirement;
    }

    function createMovement(uint256 threshold, uint256 deadlineDays, string calldata cid) external returns (uint256) {
        if (reputation.balanceOf(msg.sender) < createRequirement) revert();

        uint256 movementId = nextMovementId;
        nextMovementId++;

        uint256 deadlineBlock = block.number + deadlineDays * 7200;

        MovementData memory newMovementData = MovementData(
            msg.sender,
            threshold,
            deadlineBlock,
            cid,
            0,
            Status.Open
        );

        movements[movementId] = newMovementData;

        emit MovementCreated(movementId, msg.sender, threshold, deadlineBlock, cid);

        return movementId;
    }

    function commit(uint256 movementId) external {

        //check if movement is open,
        //check if caller hasn't already committed.
        //check if deadline has passed.
        //if all passed then:
        //add user address to committers, and set committed mapping for user to true.
        //increment tally.
        //check if tally has passed threshold, if so change status to activated.
        //emit committed.

        MovementData storage thisMovement = movements[movementId];
        if (thisMovement.status != Status.Open) revert();

        bool senderHasCommitted = committed[movementId][msg.sender];
        if (senderHasCommitted) revert();

        if (thisMovement.deadlineBlock < block.number) revert();

        committers[movementId].push(msg.sender);
        committed[movementId][msg.sender] = true;

        thisMovement.currentTally++;

        if (thisMovement.currentTally >= thisMovement.threshold) {
            thisMovement.status = Status.Activated;
            emit MovementActivated(movementId);
        }

        emit Committed(movementId, msg.sender, thisMovement.currentTally);
    }

    function resolve(uint256 movementId) external {
        MovementData storage thisMovement = movements[movementId];

        if (thisMovement.status == Status.Open && thisMovement.deadlineBlock < block.number) {
            thisMovement.status = Status.Cancelled;
            emit MovementCancelled(movementId);
        }
    }

    function setCreateRequirement(uint256 newRequirement) external {
        require(msg.sender == requirementUpdater, "unauthorised");
        emit CreateRequirementUpdated(createRequirement, newRequirement);
        createRequirement = newRequirement;


    }

    function getMovement(uint256 movementId) external view returns (MovementData memory) {
        return movements[movementId];
    }

    function isCommitted(uint256 movementId, address account) external view returns (bool) {
        return committed[movementId][account];
    }

    function getStatus(uint256 movementId) external view returns (Status) {
        return movements[movementId].status;
    }

}