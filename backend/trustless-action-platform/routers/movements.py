import time
import math
from fastapi import APIRouter, Depends, HTTPException
from web3 import Web3

from web3.contract import Contract
from blockchain import get_web3

from dependencies import GetContract

from config import Settings

router = APIRouter(
    prefix="/movement",
    tags=["movement"]
)

# Cache to prevent spamming changes everytime user create a movement
cache = {
    "threshold" : 0,
    "last_updated": 0,
}
cache_ttl = 10 # ponytail: shrunk from 300 for demo visibility, bump back up before real deployment

def get_dynamic_threshold(
    w3 : Web3 = Depends(get_web3),
    contract : Contract = Depends(GetContract("Reputation")),
) -> int:
    current_time = time.time()

    if current_time - cache['last_updated'] < cache_ttl:
        return cache['threshold']

    try:

        # Apply Scaled Floor Model 
        # It is to prevent a massive bot with low reputation to spam create_movement
        # Threshold = max( floor(log10(user_count) * B), floor(average_fraction * averageReputation) )   

        # Call Mamun's getReputation Stats
        totalReputation, userCount, averageReputation = contract.functions.getReputationStats().call()

        # Absolute Minimum Reputation
        # This determines that minimum reputation a user must have based on number of users
        B = 10
        absolute_minimum_reputation = math.floor(math.log10(userCount) * B)

        # Average Fraction
        # Because the average can be lifted up if there is an user with very high reputation and vice versa
        # This is to prevent only a small amount of insanely high reputation user to create a movement
        # and allows the normal user to become a movement creator as well. 
        fraction = 0.8
        average_fraction = math.floor(averageReputation * fraction)

        threshold = max(absolute_minimum_reputation, average_fraction)
        threshold = int(threshold)
           
        # Update cache
        cache["threshold"] = threshold
        cache['last_updated'] = current_time

        return threshold

    except Exception as e:
        print(f"RPC Error : {e}")
        return cache['threshold']


# Create Movement with Dynamic Threshold Calculation
@router.post("/create", status_code=201)
def create_movement(
    threshold: int = Depends(get_dynamic_threshold),
):
    # Passing the threshold to front end
    return threshold
