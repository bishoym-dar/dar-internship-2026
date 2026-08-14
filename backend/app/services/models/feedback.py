from __future__ import annotations

from datetime import datetime
from typing import Literal

from pydantic import BaseModel, Field, field_validator


class FeedbackRequest(BaseModel):
    message_id: str = Field(min_length=1)
    version_id: str = Field(min_length=1)

    rating: Literal["up", "down"]

    reason: str | None = None
    comment: str | None = None

    @field_validator("message_id", "version_id")
    @classmethod
    def validate_required_text(
        cls,
        value: str,
    ) -> str:
        clean_value = value.strip()

        if not clean_value:
            raise ValueError(
                "This field cannot be empty."
            )

        return clean_value

    @field_validator("reason", "comment")
    @classmethod
    def clean_optional_text(
        cls,
        value: str | None,
    ) -> str | None:
        if value is None:
            return None

        clean_value = value.strip()

        return clean_value or None


class FeedbackDocument(BaseModel):
    message_id: str
    version_id: str

    rating: Literal["up", "down"]

    reason: str | None = None
    comment: str | None = None

    created_at: datetime
    updated_at: datetime