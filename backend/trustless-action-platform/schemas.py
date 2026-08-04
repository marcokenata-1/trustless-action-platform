from pydantic import BaseModel, ConfigDict
from uuid import UUID 
from datetime import datetime

# Configure base Model 
class APIModel(BaseModel):
    model_config = ConfigDict(from_attributes=True)

###########################
#        CONTRACT         #
###########################

class ContractRequest(APIModel):
    contract_name : str