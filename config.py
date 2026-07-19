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

    model_config = SettingsConfigDict(
        env_file=".env"
    )

@lru_cache
def get_settings() -> Settings:
    settings = Settings()
    return settings