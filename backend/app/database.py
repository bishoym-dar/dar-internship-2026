from __future__ import annotations

import os
from typing import Final

from dotenv import load_dotenv
from pymongo import ASCENDING, DESCENDING, MongoClient
from pymongo.database import Database
from pymongo.errors import PyMongoError, ServerSelectionTimeoutError


load_dotenv()

MONGODB_URI: Final[str] = os.getenv(
    "MONGODB_URI",
    "mongodb://127.0.0.1:27017",
)

MONGODB_DATABASE: Final[str] = os.getenv(
    "MONGODB_DATABASE",
    "dar_rag",
)

# Fail quickly instead of making FastAPI wait a long time when MongoDB is down.
SERVER_SELECTION_TIMEOUT_MS: Final[int] = 5000


mongo_client = MongoClient(
    MONGODB_URI,
    serverSelectionTimeoutMS=SERVER_SELECTION_TIMEOUT_MS,
)

database: Database = mongo_client[MONGODB_DATABASE]

conversations_collection = database["conversations"]
messages_collection = database["messages"]
feedback_collection = database["feedback"]


def connect_to_mongodb() -> None:
    """
    Verify that MongoDB is reachable and prepare the required collections.
    """

    try:
        mongo_client.admin.command("ping")
        create_database_indexes()

        print(
            f"MongoDB connection successful. "
            f"Database: {MONGODB_DATABASE}"
        )

    except ServerSelectionTimeoutError as exc:
        raise ConnectionError(
            "MongoDB could not be reached at "
            f"{MONGODB_URI}. Confirm that the MongoDB service is running."
        ) from exc

    except PyMongoError as exc:
        raise ConnectionError(
            f"MongoDB connection failed: {exc}"
        ) from exc


def create_database_indexes() -> None:
    """
    Create indexes needed for conversations, messages, and feedback.

    MongoDB creates collections automatically when their first index or
    document is created.
    """

    conversations_collection.create_index(
        [("updated_at", DESCENDING)]
    )

    messages_collection.create_index(
        [
            ("conversation_id", ASCENDING),
            ("created_at", ASCENDING),
        ]
    )

    feedback_collection.create_index(
        [
            ("message_id", ASCENDING),
            ("created_at", DESCENDING),
        ]
    )


def get_database() -> Database:
    """Return the active MongoDB database."""

    return database


def close_mongodb_connection() -> None:
    """Close MongoDB's connection pool when FastAPI shuts down."""

    mongo_client.close()
    print("MongoDB connection closed.")