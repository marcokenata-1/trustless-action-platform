from functools import lru_cache

from pydantic_settings import BaseSettings, SettingsConfigDict

class Settings(BaseSettings):

    app_name: str = "Blokchain_Backend"
    port: int = 8000

    # TODO : Modify Database Credentials Here
    database_name: str | None = None
    database_user: str | None = None
    database_password: str | None = None
    database_url: str | None = None 

    hardhat_url: str | None = None

    # Hardhat Smart Contract address and ABI
    # TODO : Add address and ABI of deployed contract
    contracts : dict[str, dict[str, any]] = {
        "movement_contract" : {
            "address" : None, 
            "abi" : [
                {
                    "inputs": [],
                    "name": "whoAmI",
                    "outputs": [{"internalType": "address", "name": "", "type": "address"}],
                    "stateMutability": "view",
                    "type": "function"
                }   
            ]
        }, 
    }

    model_config = SettingsConfigDict(
        env_file=".env"
    )

@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    return settings