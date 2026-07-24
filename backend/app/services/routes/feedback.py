from __future__ import annotations

from datetime import datetime, timezone

from bson import ObjectId
from bson.errors import InvalidId
from fastapi import APIRouter, HTTPException
from pymongo import ReturnDocument
from pymongo.errors import PyMongoError

from app.database import (
    feedback_collection,
    messages_collection,
)
from app.services.models.feedback import FeedbackRequest


router = APIRouter(
    prefix="/api/feedback",
    tags=["Feedback"],
)


def utc_now() -> datetime:
    return datetime.now(timezone.utc)


def to_object_id(message_id: str) -> ObjectId:
    try:
        return ObjectId(message_id)
    except (InvalidId, TypeError) as exc:
        raise HTTPException(
            status_code=400,
            detail="Invalid message ID.",
        ) from exc


@router.post("")
def submit_feedback(
    feedback: FeedbackRequest,
) -> dict:
    """
    Save or update feedback for one assistant-message version.
    """

    message_object_id = to_object_id(
        feedback.message_id
    )

    try:
        message = messages_collection.find_one(
            {"_id": message_object_id}
        )
    except PyMongoError as exc:
        raise HTTPException(
            status_code=500,
            detail="The assistant message could not be loaded.",
        ) from exc

    if message is None:
        raise HTTPException(
            status_code=404,
            detail="Assistant message not found.",
        )

    if message.get("role") != "assistant":
        raise HTTPException(
            status_code=400,
            detail="Feedback can only be submitted for assistant messages.",
        )

    versions = message.get("versions") or []

    version_exists = any(
        str(version.get("version_id"))
        == feedback.version_id
        for version in versions
    )

    if not version_exists:
        raise HTTPException(
            status_code=404,
            detail="Response version not found.",
        )

    if (
        feedback.rating == "down"
        and not feedback.reason
    ):
        raise HTTPException(
            status_code=400,
            detail="A reason is required for negative feedback.",
        )

    now = utc_now()

    clean_reason = (
        feedback.reason.strip()
        if feedback.reason
        else None
    )

    clean_comment = (
        feedback.comment.strip()
        if feedback.comment
        else None
    )

    feedback_filter = {
        "message_id": feedback.message_id,
        "version_id": feedback.version_id,
    }

    feedback_update = {
        "$set": {
            "message_id": feedback.message_id,
            "version_id": feedback.version_id,
            "rating": feedback.rating,
            "reason": clean_reason,
            "comment": clean_comment,
            "updated_at": now,
        },
        "$setOnInsert": {
            "created_at": now,
        },
    }

    try:
        saved_feedback = (
            feedback_collection.find_one_and_update(
                feedback_filter,
                feedback_update,
                upsert=True,
                return_document=ReturnDocument.AFTER,
            )
        )
    except PyMongoError as exc:
        raise HTTPException(
            status_code=500,
            detail="The feedback could not be saved.",
        ) from exc

    if saved_feedback is None:
        raise HTTPException(
            status_code=500,
            detail="The feedback was not saved.",
        )

    return {
        "success": True,
        "feedback": {
            "id": str(saved_feedback["_id"]),
            "message_id": saved_feedback["message_id"],
            "version_id": saved_feedback["version_id"],
            "rating": saved_feedback["rating"],
            "reason": saved_feedback.get("reason"),
            "comment": saved_feedback.get("comment"),
            "created_at": saved_feedback[
                "created_at"
            ].isoformat(),
            "updated_at": saved_feedback[
                "updated_at"
            ].isoformat(),
        },
    }