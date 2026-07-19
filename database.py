from sqlalchemy import create_engine
from sqlalchemy.orm import sessionmaker, declarative_base
from config import get_settings

settings = get_settings()

def get_database_url():
    if not settings.database_url:
        return f"postgresql+psycopg://user:password@postgres:5432/blockchain_db"
    return settings.database_url

# Create SQL Alchemy Engine
engine = create_engine(
    get_database_url()
)

# Create a session local instance
SessionLocal = sessionmaker(
    autocommit=False,
    autoflush=False,
    bind=engine
)

base = declarative_base()

def get_db():
    db = SessionLocal()
    try:
        yield db
    finally: 
        db.close()