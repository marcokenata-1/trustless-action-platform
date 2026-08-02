from fastapi import FastAPI, HTTPException

from config import get_settings
from web3 import Web3

settings = get_settings()

def create_web3_engine():
    try:
        # Initialize Web3
        w3 = Web3(Web3.HTTPProvider(settings.hardhat_url))

        # Testing connection by getting latest block
        latest_block = w3.eth.get_block('latest')
        print(f"Web3 Engine Connected. Latest Hardhat block : {latest_block}")
        return w3

    except ConnectionError:
        return None

    except Exception as e:
        return None

web3_engine = create_web3_engine()

# Get Web3 Engine
def get_web3():

    # Validate web3 engine and make sure it is connected
    if web3_engine is None or not web3_engine.is_connected():
        raise HTTPException(
            status_code=503,
            detail="Blockchain network is currently unavailable"
        )

    return web3_engine

