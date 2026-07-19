from fastapi import APIRouter

router = APIRouter(
    prefix="/movement",
    tags=["movement"]
)

@router.get("/")
def get_movements():
    return