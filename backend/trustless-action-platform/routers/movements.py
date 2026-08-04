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
cache_ttl = 300 # Set cache time in 300 seconds

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
<<<<<<< HEAD
    threshold: int = Depends(get_dynamic_threshold),
):
    # Passing the threshold to front end
    return threshold
=======
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

    # Create New Movement Instance
    new_movement = Movement(
        title=movement_input.title,
        due=movement_input.due,
        organizer_id=current_user.id,
        ipfs_id=movement_input.ipfs_cid,
        onchain_id=None,
    )

    # Add new movement to database
    db.add(new_movement)
    db.commit()
    db.refresh(new_movement)

    # Push to Jack's function to trigger create movement
    # OR
    #

    return new_movement
>>>>>>> de1c186a56954c56d043655d307a2d1b0cff06b0
