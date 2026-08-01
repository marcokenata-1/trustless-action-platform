from fastapi import APIRouter, Depends

from sqlalchemy import select, func
from sqlalchemy.orm import Session

from models import User
from schemas import UserResponse
from database import get_db

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

@router.get("/")
def get_users():
    return


