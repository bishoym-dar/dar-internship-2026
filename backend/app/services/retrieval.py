from __future__ import annotations

import time
from pathlib import Path
from typing import Any

import weaviate
from langchain_core.documents import Document
from langchain_huggingface import HuggingFaceEmbeddings
from langchain_weaviate import WeaviateVectorStore
from weaviate.classes.init import AdditionalConfig, Timeout


# ---------------------------------------------------------------------------
# PROJECT CONFIGURATION
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = PROJECT_ROOT / "output"

COLLECTION_NAME = "CISControlChunk"
TEXT_PROPERTY = "text"

MODEL_NAME = "BAAI/bge-small-en-v1.5"
DEVICE = "cpu"

TOP_K = 15
PREVIEW_RESULTS = 5

RESULTS_FILE = OUTPUT_DIR / "retrieval_results.txt"


# ---------------------------------------------------------------------------
# EMBEDDING MODEL
# ---------------------------------------------------------------------------

def create_embedding_model() -> HuggingFaceEmbeddings:
    """
    Load the same BGE model used to embed the stored chunks.

    During retrieval, this model embeds only the user's question.
    Existing document vectors in Weaviate are reused.
    """

    print("Loading query embedding model...")

    return HuggingFaceEmbeddings(
        model_name=MODEL_NAME,
        model_kwargs={
            "device": DEVICE,
        },
        encode_kwargs={
            "normalize_embeddings": True,
            "batch_size": 32,
        },
        show_progress=False,
    )


# ---------------------------------------------------------------------------
# WEAVIATE CONNECTION
# ---------------------------------------------------------------------------

def connect_to_weaviate() -> weaviate.WeaviateClient:
    """Connect to the local Weaviate container."""

    print("Connecting to Weaviate...")

    client = weaviate.connect_to_local(
        host="localhost",
        port=8080,
        grpc_port=50051,
        additional_config=AdditionalConfig(
            timeout=Timeout(
                init=30,
                query=60,
                insert=120,
            )
        ),
    )

    if not client.is_ready():
        client.close()
        raise ConnectionError(
            "Weaviate is reachable but is not ready."
        )

    if not client.collections.exists(COLLECTION_NAME):
        client.close()
        raise RuntimeError(
            f"Collection {COLLECTION_NAME!r} does not exist. "
            "Run vector_store.py once before retrieval."
        )

    print("Weaviate connection successful.")

    return client


# ---------------------------------------------------------------------------
# LANGCHAIN RETRIEVER
# ---------------------------------------------------------------------------

def create_retriever(
    client: weaviate.WeaviateClient,
    top_k: int = TOP_K,
) -> Any:
    """
    Wrap the existing Weaviate collection as a LangChain retriever.

    Args:
        client: Active Weaviate client.
        top_k: Number of candidate chunks to retrieve.

    Returns:
        A configured LangChain retriever.
    """

    if top_k < 1:
        raise ValueError("top_k must be at least 1.")

    embedding_model = create_embedding_model()

    vector_store = WeaviateVectorStore(
        client=client,
        index_name=COLLECTION_NAME,
        text_key=TEXT_PROPERTY,
        embedding=embedding_model,
    )

    retriever = vector_store.as_retriever(
        search_type="similarity",
        search_kwargs={
            "k": top_k,
        },
    )

    return retriever


# ---------------------------------------------------------------------------
# RETRIEVAL
# ---------------------------------------------------------------------------

def retrieve_top_k(
    retriever: Any,
    question: str,
) -> tuple[list[Document], float]:
    """
    Embed one question and retrieve the top-k closest stored chunks.
    """

    clean_question = question.strip()

    if not clean_question:
        raise ValueError("The question cannot be empty.")

    started_at = time.perf_counter()

    documents = retriever.invoke(clean_question)

    duration = time.perf_counter() - started_at

    return documents, duration


# ---------------------------------------------------------------------------
# TERMINAL OUTPUT
# ---------------------------------------------------------------------------

def print_results(
    question: str,
    documents: list[Document],
    duration: float,
) -> None:
    """Print the retrieval summary and first five results."""

    print()
    print("=" * 80)
    print("RETRIEVAL COMPLETE")
    print("=" * 80)
    print(f"Question:          {question}")
    print(f"Requested top-k:   {TOP_K}")
    print(f"Returned chunks:   {len(documents)}")
    print(f"Total query time:  {duration:.4f} seconds")
    print()

    for rank, document in enumerate(
        documents[:PREVIEW_RESULTS],
        start=1,
    ):
        metadata = document.metadata

        preview = (
            document.page_content
            .replace("\n", " ")
            .strip()[:350]
        )

        print(f"RESULT {rank}")
        print(
            f"Chunk ID: "
            f"{metadata.get('chunk_id', 'Unknown')}"
        )
        print(
            f"Section: "
            f"{metadata.get('section_title', 'Unknown')}"
        )
        print(
            f"Pages: "
            f"{metadata.get('page_start', 'Unknown')} - "
            f"{metadata.get('page_end', 'Unknown')}"
        )
        print(preview)
        print("-" * 80)


# ---------------------------------------------------------------------------
# FILE OUTPUT
# ---------------------------------------------------------------------------

def save_results(
    question: str,
    documents: list[Document],
    duration: float,
    output_path: Path = RESULTS_FILE,
) -> None:
    """Save all retrieved candidates for inspection and reranking."""

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with output_path.open(
        "w",
        encoding="utf-8",
    ) as output_file:
        output_file.write("TOP-K RETRIEVAL RESULTS\n")
        output_file.write("=" * 100 + "\n\n")

        output_file.write(f"Question: {question}\n")
        output_file.write(f"Requested top-k: {TOP_K}\n")
        output_file.write(
            f"Returned chunks: {len(documents)}\n"
        )
        output_file.write(
            f"Total query time: {duration:.4f} seconds\n\n"
        )

        for rank, document in enumerate(
            documents,
            start=1,
        ):
            metadata = document.metadata

            output_file.write(f"RESULT {rank}\n")
            output_file.write("-" * 100 + "\n")

            output_file.write(
                f"Chunk ID: "
                f"{metadata.get('chunk_id', 'Unknown')}\n"
            )
            output_file.write(
                f"Section: "
                f"{metadata.get('section_title', 'Unknown')}\n"
            )
            output_file.write(
                f"Chunk type: "
                f"{metadata.get('chunk_type', 'Unknown')}\n"
            )
            output_file.write(
                f"Pages: "
                f"{metadata.get('page_start', 'Unknown')} - "
                f"{metadata.get('page_end', 'Unknown')}\n"
            )
            output_file.write(
                f"Categories: "
                f"{metadata.get('categories', [])}\n\n"
            )

            output_file.write(document.page_content)

            output_file.write(
                "\n\n" + "=" * 100 + "\n\n"
            )

    print(f"Results saved to: {output_path}")


# ---------------------------------------------------------------------------
# MAIN PROGRAM
# ---------------------------------------------------------------------------

def main() -> None:
    print("=" * 80)
    print("CIS CONTROLS TOP-K RETRIEVER")
    print("=" * 80)
    print(f"Project root: {PROJECT_ROOT}")
    print(f"Collection:   {COLLECTION_NAME}")
    print(f"Top-k:        {TOP_K}")
    print()

    question = input("Enter your question: ").strip()

    if not question:
        raise ValueError("The question cannot be empty.")

    client = connect_to_weaviate()

    try:
        retriever = create_retriever(client)

        documents, duration = retrieve_top_k(
            retriever=retriever,
            question=question,
        )

        print_results(
            question=question,
            documents=documents,
            duration=duration,
        )

        save_results(
            question=question,
            documents=documents,
            duration=duration,
        )

    finally:
        client.close()
        print("Weaviate connection closed.")


if __name__ == "__main__":
    main()