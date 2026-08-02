from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

# Load Contract ABI from json file
def load_contract_abi(contract_path:str) -> dict:
    with open(contract_path, "r") as f:
        artifacts = json.load(f)

    return artifacts["abi"]

# Configuration Settings for the application
class Settings(BaseSettings):

    app_name: str = "Blokchain_Backend"
    port: int = 8000

    # TODO : Modify Database Credentials Here
    database_name: str | None = 'figgs_db'
    database_user: str | None = 'figgs_user'
    database_password: str | None = 'figgs_password'
    database_url: str | None = f"postgresql+psycopg://{database_user}:{database_password}@localhost:5432/{database_name}"

    # Because Backend Running inside Docker container
    # We need to use host.docker.internal to access the host machine's network.
    hardhat_url: str | None = 'http://host.docker.internal:8545' 

    # Hardhat Smart Contract address and ABI
    # TODO : Add address and ABI of deployed contract
    contracts : dict[str, dict[str, any]] = {
        "AttendanceVerifier" : {
            "address" : "0xCf7Ed3AccA5a467e9e704C703E8D87F634fB0Fc9", 
            "abi" : [{"inputs":[{"internalType":"address","name":"movementAddress","type":"address"},{"internalType":"address","name":"reputationAddress","type":"address"},{"internalType":"uint256","name":"peerCount","type":"uint256"}],"stateMutability":"nonpayable","type":"constructor"},{"inputs":[{"internalType":"uint256","name":"movementId","type":"uint256"},{"internalType":"address","name":"participant","type":"address"}],"name":"AttendanceAlreadyVerified","type":"error"},{"inputs":[],"name":"ECDSAInvalidSignature","type":"error"},{"inputs":[{"internalType":"uint256","name":"length","type":"uint256"}],"name":"ECDSAInvalidSignatureLength","type":"error"},{"inputs":[{"internalType":"bytes32","name":"s","type":"bytes32"}],"name":"ECDSAInvalidSignatureS","type":"error"},{"inputs":[{"internalType":"bytes32","name":"handshakeDigest","type":"bytes32"}],"name":"HandshakeAlreadyVerified","type":"error"},{"inputs":[{"internalType":"address","name":"expected","type":"address"},{"internalType":"address","name":"recovered","type":"address"}],"name":"InvalidParticipantSignature","type":"error"},{"inputs":[{"internalType":"address","name":"peer","type":"address"}],"name":"InvalidPeer","type":"error"},{"inputs":[{"internalType":"address","name":"expected","type":"address"},{"internalType":"address","name":"recovered","type":"address"}],"name":"InvalidPeerSignature","type":"error"},{"inputs":[{"internalType":"uint256","name":"provided","type":"uint256"}],"name":"InvalidRequiredPeerCount","type":"error"},{"inputs":[],"name":"InvalidShortString","type":"error"},{"inputs":[{"internalType":"uint256","name":"movementId","type":"uint256"}],"name":"MovementNotActive","type":"error"},{"inputs":[{"internalType":"uint256","name":"required","type":"uint256"},{"internalType":"uint256","name":"provided","type":"uint256"}],"name":"NotEnoughProofs","type":"error"},{"inputs":[{"internalType":"uint256","name":"movementId","type":"uint256"},{"internalType":"address","name":"participant","type":"address"}],"name":"ParticipantNotCommitted","type":"error"},{"inputs":[{"internalType":"uint256","name":"movementId","type":"uint256"},{"internalType":"address","name":"peer","type":"address"}],"name":"PeerNotCommitted","type":"error"},{"inputs":[],"name":"ProofsNotSorted","type":"error"},{"inputs":[{"internalType":"string","name":"str","type":"string"}],"name":"StringTooLong","type":"error"},{"inputs":[],"name":"ZeroAddress","type":"error"},{"anonymous":False,"inputs":[{"indexed":True,"internalType":"uint256","name":"movementId","type":"uint256"},{"indexed":True,"internalType":"address","name":"participant","type":"address"},{"indexed":True,"internalType":"bytes32","name":"proofsHash","type":"bytes32"},{"indexed":False,"internalType":"uint256","name":"proofCount","type":"uint256"},{"indexed":False,"internalType":"address[]","name":"peers","type":"address[]"}],"name":"AttendanceVerified","type":"event"},{"anonymous":False,"inputs":[],"name":"EIP712DomainChanged","type":"event"},{"inputs":[],"name":"ATTENDANCE_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"HANDSHAKE_TYPEHASH","outputs":[{"internalType":"bytes32","name":"","type":"bytes32"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"MIN_REQUIRED_PEER_COUNT","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"movementId","type":"uint256"},{"internalType":"address","name":"participant","type":"address"}],"name":"attendanceVerified","outputs":[{"internalType":"bool","name":"verified","type":"bool"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"eip712Domain","outputs":[{"internalType":"bytes1","name":"fields","type":"bytes1"},{"internalType":"string","name":"name","type":"string"},{"internalType":"string","name":"version","type":"string"},{"internalType":"uint256","name":"chainId","type":"uint256"},{"internalType":"address","name":"verifyingContract","type":"address"},{"internalType":"bytes32","name":"salt","type":"bytes32"},{"internalType":"uint256[]","name":"extensions","type":"uint256[]"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"movement","outputs":[{"internalType":"contract IMovement","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"reputation","outputs":[{"internalType":"contract IReputation","name":"","type":"address"}],"stateMutability":"view","type":"function"},{"inputs":[],"name":"requiredPeerCount","outputs":[{"internalType":"uint256","name":"","type":"uint256"}],"stateMutability":"view","type":"function"},{"inputs":[{"internalType":"uint256","name":"movementId","type":"uint256"},{"internalType":"address","name":"participant","type":"address"},{"components":[{"internalType":"address","name":"peer","type":"address"},{"internalType":"bytes32","name":"nonce","type":"bytes32"},{"internalType":"uint64","name":"timestamp","type":"uint64"},{"internalType":"bytes","name":"peerSignature","type":"bytes"}],"internalType":"struct AttendanceVerifier.HandshakeProof[]","name":"proofs","type":"tuple[]"},{"internalType":"bytes","name":"participantSignature","type":"bytes"}],"name":"submitAttendance","outputs":[],"stateMutability":"nonpayable","type":"function"},{"inputs":[{"internalType":"bytes32","name":"handshakeDigest","type":"bytes32"}],"name":"verifiedHandshakeDigests","outputs":[{"internalType":"bool","name":"verified","type":"bool"}],"stateMutability":"view","type":"function"}]
        }, 
        
    }

    model_config = SettingsConfigDict(
        env_file=".env"
    )

@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    return settings