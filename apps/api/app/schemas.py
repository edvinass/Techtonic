from datetime import datetime
from typing import Any
from uuid import UUID

from pydantic import BaseModel, EmailStr, Field


class RegisterRequest(BaseModel):
    email: EmailStr
    password: str = Field(min_length=8, max_length=128)


class LoginRequest(BaseModel):
    email: EmailStr
    password: str


class TokenResponse(BaseModel):
    access_token: str
    token_type: str = "bearer"


class UserResponse(BaseModel):
    id: UUID
    email: EmailStr
    created_at: datetime


class SaveMeta(BaseModel):
    slot: int
    name: str
    age: str
    schema_version: int
    updated_at: datetime
    empty: bool = False


class SaveResponse(BaseModel):
    slot: int
    name: str
    age: str
    schema_version: int
    state: dict[str, Any]
    updated_at: datetime


class SaveUpsertRequest(BaseModel):
    name: str = Field(default="Settlement", max_length=120)
    age: str = Field(default="stone", max_length=32)
    schema_version: int = Field(default=1, ge=1)
    state: dict[str, Any]
