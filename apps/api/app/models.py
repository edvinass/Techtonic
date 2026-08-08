from datetime import datetime, timezone
from typing import Any
from uuid import UUID, uuid4

from sqlalchemy import Column, UniqueConstraint
from sqlalchemy.dialects.postgresql import JSONB
from sqlmodel import Field, SQLModel


def utcnow() -> datetime:
    return datetime.now(timezone.utc)


class User(SQLModel, table=True):
    __tablename__ = "users"

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    email: str = Field(index=True, unique=True, max_length=320)
    password_hash: str
    created_at: datetime = Field(default_factory=utcnow)


class Save(SQLModel, table=True):
    __tablename__ = "saves"
    __table_args__ = (UniqueConstraint("user_id", "slot", name="uq_user_slot"),)

    id: UUID = Field(default_factory=uuid4, primary_key=True)
    user_id: UUID = Field(foreign_key="users.id", index=True)
    slot: int = Field(ge=1, le=3)
    name: str = Field(default="Settlement", max_length=120)
    age: str = Field(default="stone", max_length=32)
    schema_version: int = Field(default=1)
    state: dict[str, Any] = Field(default_factory=dict, sa_column=Column(JSONB, nullable=False))
    updated_at: datetime = Field(default_factory=utcnow)
    created_at: datetime = Field(default_factory=utcnow)
