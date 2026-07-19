from fastapi import APIRouter

# Apply "users" endpoint 
router = APIRouter(
    prefix="/users",
    tags=["users"]
)

@router.get("/")
def get_users():
    return


