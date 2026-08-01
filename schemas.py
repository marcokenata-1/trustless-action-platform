from pydantic import BaseModel, ConfigDict
from uuid import UUID 
from datetime import datetime

# Configure base Model 
class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)


#############################
#           AUTH            #
#############################

class WalletLoginPayload(APIModel):
    address : str
    message : str # Text user signed on frontend
    signature : str  # Hash produced by metamask


#############################
#           USER            #
#############################

class UserPayload(APIModel):
    address : str
    reputation : int

# User Response
class UserResponse(APIModel):
    id : UUID
    address : str
    reputation : int


#############################
#         MOVEMENT          #
#############################

# Create Movement Input Format
class MovementPayload(APIModel):
    title : str
    due : datetime
    ipfs_cid : str

# Movement Response
class MovementResponse(APIModel):
    id : UUID
    onchain_id : int | None
    ipfs_id : str | None
    organizer : UUID
    title : str
    due : datetime
    status : str


#############################
#        PARTICIPANT        #
#############################

# Participation Response
class ParticipantResponse(APIModel):
    participant_id : UUID
    status : str
    

    
    