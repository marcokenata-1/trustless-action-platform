import uuid
from datetime import datetime, timezone
from enum import Enum

from sqlalchemy import Column, String, Integer, DateTime, ForeignKey, Enum
from sqlalchemy.orm import relationship
from sqlalchemy.dialects.postgresql import UUID

from database import base

# Enums
class MovementStatus(str, Enum):
    active = "active"
    completed = "completed"
    cancelled = "cancelled"

class AttendanceStatus(str, Enum):
    register = "register"
    attend = "attend"
    miss = "miss"

# Database Models
# TODO : Need Checking for database structure

# User Table
class User(base):
    __tablename__ = "users"

    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    credibility = Column(Integer, default=0, nullable=False)
    participation = relationship("Participant", back_populates="user")

# Movement Table
class Movement(base):
    __tablename__ = "movements"
    
    id = Column(UUID(as_uuid=True), primary_key=True, default=uuid.uuid4)
    title = Column(String, nullable=False)
    due = Column(DateTime(timezone=True), nullable=False)
    status = Column(Enum(MovementStatus), default=MovementStatus.active, nullable=False)
    participants = relationship("Participant", back_populates="movement")
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda : datetime.now(timezone.utc))

# Participant Table
class Participant(base):
    __tablename__ = "participant"

    movement_id = Column(UUID(as_uuid=True), ForeignKey('movements.id'), primary_key=True)
    participant_id = Column(UUID(as_uuid=True), ForeignKey('users.id'), primary_key=True)
    attendance_status = Column(Enum(AttendanceStatus), default=AttendanceStatus.register, nullable=False)
    created_at = Column(DateTime(timezone=True), nullable=False, default=lambda : datetime.now(timezone.utc))
    movements = relationship("Movement", back_populates="participants")
    user = relationship("User", back_populates="participations")