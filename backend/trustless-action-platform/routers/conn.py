from fastapi import APIRouter, Depends ,HTTPException
from web3 import Web3

from config import get_settings
from blockchain import get_web3
from dependencies import GetContract

settings = get_settings()

router = APIRouter(
    prefix="/conn",
    tags=["connection"]
)

# Testing Connection to Blockchain Node and Smart Contract 
@router.get('/test')
def test_connection(
    contract = Depends(GetContract("AttendanceVerifier")),
):
    return {
        "message": "Successfully connected to the blockchain node and smart contract.",
        "contract_address": contract.address,
        "contract_abi": contract.abi
    }

@router.get("/balance/{address}")
def get_balance(
    address: str,
    w3: Web3 = Depends(get_web3)
):
    """Get the Ether balance of a specific address."""
    # Validate the Ethereum address
    if not w3.is_address(address):
        raise HTTPException(status_code=400, detail="Invalid Ethereum address")
    
    # Convert address to checksum format (required by web3.py)
    checksum_address = w3.to_checksum_address(address)
    
    # Fetch balance in Wei and convert to Ether
    balance_wei = w3.eth.get_balance(checksum_address)
    balance_eth = w3.from_wei(balance_wei, "ether")
    
    return {"address": checksum_address, "balance_ETH": balance_eth}