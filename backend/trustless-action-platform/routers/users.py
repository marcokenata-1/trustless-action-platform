from web3 import Web3
from fastapi import APIRouter, Depends, HTTPException

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from models import User
from schemas import UserResponse
from database import get_db
from blockchain import get_web3
from dependencies import GetContract

# Get Average Reputation Across All Users
def get_user_average_reputation(
    db: Session = Depends(get_db)
) -> int:
    
    # Retrieve Average Reputation
    statement = select(func.avg(User.reputation))
    average = db.scalar(statement)
    
    return average


# Apply "users" endpoint 
router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.get("/{address}", status_code=200, response_model=UserResponse)
def current_user(
    address: str,
    db: Session = Depends(get_db),
    w3: Web3 = Depends(get_web3),
    contract = Depends(GetContract('Reputation'))
):  
    '''
        Get current user
        Endpoint : /users/{address}
    '''

    # Get user checksum wallet address from on chain
    try:
        checksum_address = w3.to_checksum_address(address)
        
    except Exception as e:
        raise HTTPException(
            status_code=400,
            detail="Invalid Ethereum Address"
        )
    
    # Get user data from database
    statement = select(User).where(address == checksum_address).first()
    user = db.first(statement)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found in database"
        )

    # Retrieve user reputation for synchronization between onchain and offchain
    current_reputation = contract.caller().balanceOf(checksum_address)

    # Update reputation on database if it doesn't synchronize
    if current_reputation != user.reputation:
        user.reputation = current_reputation
        db.commit()
        db.refresh(user)

    return UserResponse(
        address=address,
        reputation=current_reputation
    )


@router.post("/register", status_code=201, response_model=UserResponse)
def register_user(
    user_payload: UserResponse,
    db: Session = Depends(get_db),
    w3: Web3 = Depends(get_web3),
    contract = Depends(GetContract('Reputation'))
):
    """
        Register a new user in the database.
        Endpoint : /users/register
    """
    
    # Get user wallet checksum address
    checksum_address = w3.to_checksum_address(user_payload.address)

    is_registered = contract.caller().isRegistered(checksum_address)

    if not is_registered:
        raise HTTPException(
            status_code=400,
            detail="User is not registered on-chain."
        )

    # Check if user already exists in the database
    statement = select(User).where(User.address == checksum_address)
    existing_user = db.scalar(statement)

    if existing_user:
        raise HTTPException(
            status_code=409,
            detail="User already registered."
        )

    # Get initial reputation from smart contract
    initial_reputation = contract.caller().balanceOf(checksum_address)

    # Create a new user instance
    new_user = User(
        address=checksum_address,
        reputation=initial_reputation
    )

    # Save new user to database
    db.add(new_user)
    db.commit()
    db.refresh(new_user)

    return UserResponse(
        address=user_payload.address,
        reputation=initial_reputation
    )