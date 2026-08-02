from web3 import Web3
from fastapi import APIRouter, Depends, HTTPException, Header
from eth_account.messages import encode_defunct

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from models import User
from schemas import UserResponse, LoginPayload
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

# User Authentication
@router.post("/login", response_model = UserResponse)
def wallet_login(
    payload : LoginPayload,
    db : Session = Depends(get_db),
    w3 : Web3 = Depends(get_web3),
    contract = Depends(GetContract('movement_contract')),
):
    '''
        User login
        endpoint : /users/login
    '''
    
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
    statement = select(User).where(User.address == payload.address) 
    user = db.scalar_one_or_none(statement)

    # Get reputation from contract
    try : 
        reputation_contract = contract.caller.balanceOf(checksum_address)
    except Exception as e:
        print(f"Fetch reputation failed : {e}")
        reputation_contract = 0

    # Add user to database if user doesn't exists
    if not user:
        user = User(
            address=payload.address,
            reputation=reputation_contract
        )
        db.add(user)
    else:
        user.reputation = reputation_contract

    db.commit()
    db.refresh(user)

    return user

@router.get("/current", status_code=200, response_model=UserResponse)
def current_user(
    address: str = Header(...),
    signature : str = Header(...),
    db: Session = Depends(get_db),
    w3: Web3 = Depends(get_web3),
):  
    '''
        Get current user based from blockchain address
        Endpoint : /users/{address}
    '''

    # Address Validation
    if not w3.is_address(address):
        raise HTTPException(
            status_code=400,
            detail="Invalid Address Format"
        )

    # Get user checksum wallet address from on chain
    checksum_address = w3.to_checksum_address(address)

    # Authenticate Address by sending simple message
    dummy_message = "Sign this message to authenticate"

    try:
        encoded_message = encode_defunct(text=dummy_message)
        address_recovered = w3.eth.recover_message(
            encoded_message,
            signature=signature
        )
    except:
        raise HTTPException(
            status_code=400, 
            detail="Invalid Signature"
        )

    # Check if address recovered the same as the sending address
    if address_recovered != checksum_address:   
        raise HTTPException(
            status_code=401,
            detail="Signature Verification Failed"
        )

    # Retrieve user data from database
    statement = select(User).where(User.address == address)
    user = db.scalar_one_or_none(statement)

    if not user:
        raise HTTPException(
            status_code=404,
            detail="User not found in database"
        )

    return UserResponse(
        id=user.id,
        address=user.address,
        reputation=user.reputation
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