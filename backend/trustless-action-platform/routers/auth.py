from fastapi import APIRouter, Depends, HTTPException

from uuid import UUID
from web3 import Web3
import json

from eth_account.messages import encode_defunct

from sqlalchemy import select
from sqlalchemy.orm import Session

from config import Settings
from models import User
from schemas import WalletLoginPayload, UserResponse
from database import get_db
from blockchain import get_web3
from dependencies import GetContract

settings = Settings()

router = APIRouter(
    prefix = "/auth",
    tags = ['auth']
)

