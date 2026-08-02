from fastapi import APIRouter, Depends, HTTPException

from uuid import UUID
from web3 import Web3
import json

from eth_account.messages import encode_defunct

from sqlalchemy import select
from sqlalchemy.orm import Session

from config import Settings
from models import User
from schemas import WalletLoginPayload, UserResponse
from database import get_db
from blockchain import get_web3
from dependencies import GetContract

settings = Settings()

router = APIRouter(
    prefix = "/auth",
    tags = ['auth']
)

@router.post("/auth/login", response_model = UserResponse)
def wallet_login(
    payload : WalletLoginPayload,
    db : Session = Depends(get_db),
    w3 : Web3 = Depends(get_web3),
    contract = Depends(GetContract('movement_contract')),
):
    
    # Validate Address 
    if not w3.is_address(payload.address):
        raise HTTPException(
            status=400,
            detail="Invalid Ethereum address format"
        )

    checksum_address = w3.to_checksum_address(payload.address)

    try:
        # Get a dummy message
        encoded_message = encode_defunct(text=payload.message)

        # Get address of the account that signed that dummy message
        address_recovered = w3.eth.recover_message(
            encoded_message,
            signature=payload.signature
        )

    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="Invalid Signature"
        )

    # Make sure the address recovered and its checksum address is the same for Authentication
    if address_recovered != checksum_address:
        raise HTTPException(
            status_code=401,
            detail="Signature verification failed."
        )

    # Look for user with the same address
    statement = select(User).where(User.address == checksum_address) 
    user = db.scalar_one_or_none(statement)

    try : 
        reputation_contract = contract.caller.balanceOf(checksum_address)
    except Exception as e:
        print(f"Fetch reputation failed : {e}")
        reputation_contract = 0


    if not user:
        user = User(
            address=checksum_address,
            reputation=reputation_contract
        )
        db.add(user)
    else:
        user.reputation = reputation_contract

    db.commit()
    db.refresh(user)

    return user

@router.post("/auth/register", response_model = UserResponse)
def wallet_register(
    UserPayload : UserResponse,
    db : Session = Depends(get_db),
    web3 : Web3 = Depends(get_web3)
):
    
    return