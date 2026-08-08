from datetime import datetime, timezone
from typing import Annotated

from fastapi import APIRouter, Depends, HTTPException, status
from sqlmodel import Session, select

from app.auth import get_current_user
from app.database import get_session
from app.models import Save, User
from app.schemas import SaveMeta, SaveResponse, SaveUpsertRequest

router = APIRouter(prefix="/saves", tags=["saves"])


def _validate_slot(slot: int) -> None:
    if slot < 1 or slot > 3:
        raise HTTPException(status_code=status.HTTP_400_BAD_REQUEST, detail="Slot must be 1–3")


@router.get("", response_model=list[SaveMeta])
def list_saves(
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> list[SaveMeta]:
    existing = {
        save.slot: save
        for save in session.exec(select(Save).where(Save.user_id == user.id)).all()
    }
    result: list[SaveMeta] = []
    for slot in (1, 2, 3):
        save = existing.get(slot)
        if save is None:
            result.append(
                SaveMeta(
                    slot=slot,
                    name="",
                    age="stone",
                    schema_version=1,
                    updated_at=datetime.now(timezone.utc),
                    empty=True,
                )
            )
        else:
            result.append(
                SaveMeta(
                    slot=save.slot,
                    name=save.name,
                    age=save.age,
                    schema_version=save.schema_version,
                    updated_at=save.updated_at,
                    empty=False,
                )
            )
    return result


@router.get("/{slot}", response_model=SaveResponse)
def get_save(
    slot: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> Save:
    _validate_slot(slot)
    save = session.exec(
        select(Save).where(Save.user_id == user.id, Save.slot == slot)
    ).first()
    if save is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Save not found")
    return save


@router.put("/{slot}", response_model=SaveResponse)
def upsert_save(
    slot: int,
    body: SaveUpsertRequest,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> Save:
    _validate_slot(slot)
    save = session.exec(
        select(Save).where(Save.user_id == user.id, Save.slot == slot)
    ).first()
    now = datetime.now(timezone.utc)
    if save is None:
        save = Save(
            user_id=user.id,
            slot=slot,
            name=body.name,
            age=body.age,
            schema_version=body.schema_version,
            state=body.state,
            updated_at=now,
        )
        session.add(save)
    else:
        save.name = body.name
        save.age = body.age
        save.schema_version = body.schema_version
        save.state = body.state
        save.updated_at = now
        session.add(save)
    session.commit()
    session.refresh(save)
    return save


@router.delete("/{slot}", status_code=status.HTTP_204_NO_CONTENT)
def delete_save(
    slot: int,
    user: Annotated[User, Depends(get_current_user)],
    session: Annotated[Session, Depends(get_session)],
) -> None:
    _validate_slot(slot)
    save = session.exec(
        select(Save).where(Save.user_id == user.id, Save.slot == slot)
    ).first()
    if save is None:
        raise HTTPException(status_code=status.HTTP_404_NOT_FOUND, detail="Save not found")
    session.delete(save)
    session.commit()
