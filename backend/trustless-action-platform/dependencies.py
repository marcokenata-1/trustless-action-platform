from fastapi import Depends
import json

from web3 import Web3
from web3.contract import Contract

from config import Settings
from blockchain import get_web3

settings = Settings()

# Get Contract from Hardhat
class GetContract:

    def __init__(self, contract_name: str):
        self.contract_name = contract_name

    def __call__(self, w3 : Web3 = Depends(get_web3)) -> Contract:

        abi = settings.contracts[self.contract_name]['abi']
        checksum_address = w3.to_checksum_address(settings.address_for(self.contract_name))

        return w3.eth.contract(
            address=checksum_address,
            abi=abi
        )