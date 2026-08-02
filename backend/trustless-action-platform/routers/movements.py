from fastapi import APIRouter, Depends, HTTPException

from uuid import UUID

from sqlalchemy import select
from sqlalchemy.orm import Session

from routers.users import current_user

from models import Movement
from schemas import MovementResponse, MovementPayload, UserResponse
from database import get_db
from dependencies import GetContract

from routers.users import get_user_average_reputation

def movement_item(session: Movement) -> MovementResponse:
    return MovementResponse(
        id=session.id,
        organizer=session.organizer,
        title=session.title,
        due=session.due,
        status=session.status,
        onchain_id=session.onchain_id,
        ipfs_id=session.ipfs_id
    )

router = APIRouter(
    prefix="/movement",
    tags=["movement"]
)

@router.get("/")
def get_movements(
    db : Session = Depends(get_db)
) -> list[MovementResponse]:
    """
        Retrieve All Movements data from database
        Endpoint : /movement
    """

    # Query to retrieve all movements
    statement = select(Movement).order_by(Movement.created_at)

    # Extract raw database results to ORM object
    sessions = db.scalars(statement).all()

    return [movement_item(session) for session in sessions]



# Get User reputation, create movement and filter, connect to ether 
@router.post("/create", status_code=201)
def create_movement(
    movement_input : MovementPayload,
    current_user = Depends(current_user),
    db : Session = Depends(get_db),
    threshold : float = Depends(get_user_average_reputation), # Get average reputation across all users
    reputation_contract = Depends(GetContract('Reputation'))
):  
    
    # Validate User Reputation
    if current_user.reputation < threshold:
        raise HTTPException(
            status_code=400,
            detail="Insufficient Reputation to create movement"
        )

    try:
        # Call Mamun's "averageReputation" function 
        onchain_requirement = reputation_contract.caller().averageReputation()
    except Exception as e:
        raise HTTPException(
            status_code=500,
            detail="Failed to call function"
        )

    # If offchain and onchain requirement doesn't match
    if int(threshold) != (onchain_requirement):
        raise HTTPException(
            status_code=409,
            detail="Offchain Requirement is not match with the onchain requirement"
        )

    ipfs_id = ''
    
    # Create New Movement Instance
    new_movement = Movement(
        title=movement_input.title,
        due=movement_input.due,
        organizer=current_user.id,
        ipfs_id=ipfs_id,
        onchain_id=None,
    )

    # Add new movement to database
    db.add(new_movement)
    db.commit()
    db.refresh(new_movement)

    return new_movement()