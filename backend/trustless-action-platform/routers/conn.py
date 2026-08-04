from fastapi import APIRouter, Depends ,HTTPException
from web3 import Web3
from web3.contract import Contract

from config import get_settings
from blockchain import get_web3
from dependencies import GetContract
from schemas import ContractRequest

'''
THIS FILE IS STRICTLY FOR TESTING BLOCKCHAIN CONNECTION
'''


settings = get_settings()

router = APIRouter(
    prefix="/conn",
    tags=["connection"]
)



# Testing Connection to Blockchain Node and Smart Contract 
@router.post('/test')
def test_connection(
    request : ContractRequest,
    w3 : Web3 = Depends(get_web3),
):
    try:

        # Checking web3 is connected
        if not w3.is_connected():
            raise HTTPException(
                status_code=500, 
                detail="Web3 is not connected to the Hardhat node. Check if it's running."
            )

        try:
            # Define Contract
            contract_instance = GetContract(request.contract_name)
            contract : Contract = contract_instance(w3)

            # Get code from contract address
            contract_code = w3.eth.get_code(contract.address)
        except KeyError:
            # Handle the case where they send a contract_name that doesn't exist in settings
            raise HTTPException(
                status_code=404, 
                detail=f"Contract '{request.contract_name}' not found in configurations."
            )

        # If the Node is connected but can't connect to contract
        if contract_code == b'' or contract_code.hex() == '0x':
            raise HTTPException(
                status_code=404, 
                detail=f"Node connected, but no contract found at {contract.address}. The state was likely removed."
            )

        return {
            "message": "Successfully connected to the blockchain node and smart contract.",
            "contract_address": contract.address,
            "contract_abi": contract.abi
        }
    
    except Exception as e:
        # Catch any other RPC errors
        raise HTTPException(status_code=500, detail=f"Connection test failed: {str(e)}")

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