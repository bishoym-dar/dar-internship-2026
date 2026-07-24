from __future__ import annotations

import time
from collections.abc import Iterator
from typing import Any

from app.services.generation import (
    close_ollama_client,
    generate_answer,
    stream_answer,
    verify_ollama,
)
from app.services.reranking import (
    BGEReranker,
    rerank_documents,
)
from app.services.retrieval import (
    connect_to_weaviate,
    create_retriever,
    retrieve_top_k,
)


# ---------------------------------------------------------------------------
# PROJECT CONFIGURATION
# ---------------------------------------------------------------------------

EMBEDDING_MODEL_NAME = (
    "BAAI/bge-small-en-v1.5"
)

VECTOR_DATABASE_NAME = "Weaviate"

RETRIEVAL_TOP_K = 15

RERANKER_MODEL_NAME = (
    "BAAI/bge-reranker-v2-m3"
)

FINAL_CONTEXT_DOCUMENTS = 5


# ---------------------------------------------------------------------------
# OUTPUT HELPERS
# ---------------------------------------------------------------------------

def print_header(
    title: str,
) -> None:
    """Print a consistent section header."""

    print()
    print("=" * 80)
    print(title)
    print("=" * 80)


def print_step(
    step_number: int,
    title: str,
) -> None:
    """Print one pipeline-stage heading."""

    print()
    print(
        f"STEP {step_number}/3 - {title}"
    )
    print("-" * 80)


def print_sources(
    source_labels: list[str],
) -> None:
    """Print the source labels used during generation."""

    print()
    print("Sources Used")
    print("-" * 80)

    if not source_labels:
        print(
            "No source labels were returned."
        )
        return

    for source_label in source_labels:
        print(source_label)


def print_pipeline_summary(
    retrieved_count: int,
    reranked_count: int,
    retrieval_seconds: float,
    reranking_seconds: float,
    generation_metrics: dict[str, Any],
    total_seconds: float,
) -> None:
    """Print performance information for the complete pipeline."""

    print_header(
        "RAG PIPELINE SUMMARY"
    )

    print(
        f"Embedding model : "
        f"{EMBEDDING_MODEL_NAME}"
    )
    print(
        f"Vector DB       : "
        f"{VECTOR_DATABASE_NAME}"
    )
    print(
        f"Retriever       : "
        f"Top-{RETRIEVAL_TOP_K}"
    )
    print(
        f"Reranker        : "
        f"{RERANKER_MODEL_NAME}"
    )
    print(
        f"Generator       : "
        f"{generation_metrics.get('model', 'Unknown')}"
    )

    print()
    print(
        f"Retrieved chunks : "
        f"{retrieved_count}"
    )
    print(
        f"Reranked chunks  : "
        f"{reranked_count}"
    )

    print()
    print(
        f"Retrieval time : "
        f"{retrieval_seconds:.3f} s"
    )
    print(
        f"Reranking time : "
        f"{reranking_seconds:.3f} s"
    )

    generation_seconds = (
        generation_metrics.get(
            "generation_seconds"
        )
    )

    if isinstance(
        generation_seconds,
        (int, float),
    ):
        print(
            f"Generation time: "
            f"{generation_seconds:.3f} s"
        )

    print(
        f"Total time     : "
        f"{total_seconds:.3f} s"
    )

    prompt_tokens = (
        generation_metrics.get(
            "prompt_tokens"
        )
    )

    generated_tokens = (
        generation_metrics.get(
            "generated_tokens"
        )
    )

    if (
        prompt_tokens is not None
        or generated_tokens is not None
    ):
        print()
        print(
            f"Prompt tokens    : "
            f"{prompt_tokens}"
        )
        print(
            f"Generated tokens : "
            f"{generated_tokens}"
        )

    print_sources(
        generation_metrics.get(
            "source_labels",
            [],
        )
    )


# ---------------------------------------------------------------------------
# CITATION METADATA
# ---------------------------------------------------------------------------

def make_json_safe(
    value: Any,
) -> Any:
    """
    Convert common metadata values into objects that json.dumps can safely
    serialize.
    """

    if value is None:
        return None

    if isinstance(
        value,
        (str, int, float, bool),
    ):
        return value

    if isinstance(value, dict):
        return {
            str(key): make_json_safe(
                nested_value
            )
            for key, nested_value
            in value.items()
        }

    if isinstance(
        value,
        (list, tuple, set),
    ):
        return [
            make_json_safe(item)
            for item in value
        ]

    return str(value)


def build_source_metadata(
    documents: list[Any],
) -> list[dict[str, Any]]:
    """
    Convert reranked LangChain documents into JSON-compatible source
    metadata for MongoDB, SSE, and clickable frontend citations.
    """

    sources: list[dict[str, Any]] = []

    for source_number, document in enumerate(
        documents,
        start=1,
    ):
        metadata = dict(
            getattr(
                document,
                "metadata",
                {},
            )
            or {}
        )

        page_content = str(
            getattr(
                document,
                "page_content",
                "",
            )
            or ""
        )

        document_name = (
            metadata.get("document_name")
            or metadata.get("file_name")
            or metadata.get("filename")
            or metadata.get("source")
            or metadata.get("document")
            or metadata.get("title")
        )

        categories = metadata.get(
            "categories",
            [],
        )

        if categories is None:
            categories = []

        elif isinstance(
            categories,
            (tuple, set),
        ):
            categories = list(categories)

        elif not isinstance(
            categories,
            list,
        ):
            categories = [categories]

        categories = [
            str(category)
            for category in categories
        ]

        chunk_id = metadata.get(
            "chunk_id"
        )

        if chunk_id is None:
            chunk_id = metadata.get(
                "chunk"
            )

        page_start = metadata.get(
            "page_start"
        )

        if page_start is None:
            page_start = metadata.get(
                "page"
            )

        page_end = metadata.get(
            "page_end"
        )

        if page_end is None:
            page_end = page_start

        clean_preview = " ".join(
            page_content.split()
        )[:500]

        source = {
            "source_number": (
                source_number
            ),
            "chunk_id": make_json_safe(
                chunk_id
            ),
            "section_title": (
                make_json_safe(
                    metadata.get(
                        "section_title"
                    )
                )
            ),
            "chunk_type": (
                make_json_safe(
                    metadata.get(
                        "chunk_type"
                    )
                )
            ),
            "page_start": (
                make_json_safe(
                    page_start
                )
            ),
            "page_end": (
                make_json_safe(
                    page_end
                )
            ),
            "categories": categories,
            "document_name": (
                str(document_name)
                if document_name is not None
                else None
            ),
            "preview": clean_preview,
        }

        sources.append(source)

    return sources


# ---------------------------------------------------------------------------
# MAIN RAG PIPELINE
# ---------------------------------------------------------------------------

def run_rag_pipeline(
    question: str,
) -> tuple[str, dict[str, Any]]:
    """
    Run the complete RAG pipeline for one user question.

    Pipeline:
        1. Retrieve candidate chunks from Weaviate.
        2. Rerank the candidates.
        3. Generate an answer through Ollama.
        4. Return citation metadata for the reranked chunks.
    """

    clean_question = question.strip()

    if not clean_question:
        raise ValueError(
            "The question cannot be empty."
        )

    overall_start = time.perf_counter()

    client = None

    try:
        print_step(
            1,
            "RETRIEVAL",
        )

        client = connect_to_weaviate()

        retriever = create_retriever(
            client=client,
            top_k=RETRIEVAL_TOP_K,
        )

        (
            retrieved_documents,
            retrieval_time,
        ) = retrieve_top_k(
            retriever=retriever,
            question=clean_question,
        )

        if not retrieved_documents:
            raise RuntimeError(
                "Retrieval returned no "
                "document chunks."
            )

        print(
            f"Retrieved "
            f"{len(retrieved_documents)} "
            f"chunks in "
            f"{retrieval_time:.3f} seconds."
        )

        print_step(
            2,
            "RERANKING",
        )

        reranker = BGEReranker()

        (
            reranked_documents,
            reranking_time,
        ) = rerank_documents(
            question=clean_question,
            documents=(
                retrieved_documents
            ),
            reranker=reranker,
            top_n=(
                FINAL_CONTEXT_DOCUMENTS
            ),
        )

        if not reranked_documents:
            raise RuntimeError(
                "Reranking returned no "
                "document chunks."
            )

        print(
            f"Selected "
            f"{len(reranked_documents)} "
            f"highest-scoring chunks in "
            f"{reranking_time:.3f} seconds."
        )

        sources = build_source_metadata(
            reranked_documents
        )

        print_step(
            3,
            "GENERATION",
        )

        (
            answer,
            generation_metrics,
        ) = generate_answer(
            question=clean_question,
            documents=(
                reranked_documents
            ),
        )

        total_time = (
            time.perf_counter()
            - overall_start
        )

        pipeline_metrics: dict[
            str,
            Any,
        ] = {
            "question": clean_question,
            "retrieved_count": len(
                retrieved_documents
            ),
            "reranked_count": len(
                reranked_documents
            ),
            "retrieval_seconds": (
                retrieval_time
            ),
            "reranking_seconds": (
                reranking_time
            ),
            "generation": (
                generation_metrics
            ),
            "sources": sources,
            "total_seconds": total_time,
        }

        return answer, pipeline_metrics

    finally:
        if client is not None:
            client.close()


def stream_rag_pipeline(
    question: str,
) -> Iterator[dict[str, Any]]:
    """
    Retrieve and rerank documents, then stream structured answer events.

    Events:
        {"type": "chunk", "content": "..."}
        {"type": "sources", "sources": [...]}
    """

    clean_question = question.strip()

    if not clean_question:
        raise ValueError(
            "The question cannot be empty."
        )

    client = None

    reranked_documents: list[Any] = []
    sources: list[dict[str, Any]] = []

    try:
        print_step(
            1,
            "RETRIEVAL",
        )

        client = connect_to_weaviate()

        retriever = create_retriever(
            client=client,
            top_k=RETRIEVAL_TOP_K,
        )

        (
            retrieved_documents,
            retrieval_time,
        ) = retrieve_top_k(
            retriever=retriever,
            question=clean_question,
        )

        if not retrieved_documents:
            raise RuntimeError(
                "Retrieval returned no "
                "document chunks."
            )

        print(
            f"Retrieved "
            f"{len(retrieved_documents)} "
            f"chunks in "
            f"{retrieval_time:.3f} seconds."
        )

        print_step(
            2,
            "RERANKING",
        )

        reranker = BGEReranker()

        (
            reranked_documents,
            reranking_time,
        ) = rerank_documents(
            question=clean_question,
            documents=(
                retrieved_documents
            ),
            reranker=reranker,
            top_n=(
                FINAL_CONTEXT_DOCUMENTS
            ),
        )

        if not reranked_documents:
            raise RuntimeError(
                "Reranking returned no "
                "document chunks."
            )

        print(
            f"Selected "
            f"{len(reranked_documents)} "
            f"highest-scoring chunks in "
            f"{reranking_time:.3f} seconds."
        )

        sources = build_source_metadata(
            reranked_documents
        )

    finally:
        if client is not None:
            client.close()

    print_step(
        3,
        "GENERATION",
    )

    for chunk in stream_answer(
        question=clean_question,
        documents=reranked_documents,
    ):
        if not chunk:
            continue

        yield {
            "type": "chunk",
            "content": str(chunk),
        }

    yield {
        "type": "sources",
        "sources": sources,
    }


# ---------------------------------------------------------------------------
# TERMINAL APPLICATION
# ---------------------------------------------------------------------------

def main() -> None:
    """Run the local CIS Controls RAG system from the terminal."""

    print_header(
        "CIS CONTROLS RAG SYSTEM"
    )

    verify_ollama()

    question = input(
        "Ask a question: "
    ).strip()

    try:
        (
            answer,
            pipeline_metrics,
        ) = run_rag_pipeline(
            question
        )

        print_header(
            "FINAL ANSWER"
        )

        print()
        print(answer)

        generation_metrics = (
            pipeline_metrics[
                "generation"
            ]
        )

        print_pipeline_summary(
            retrieved_count=(
                pipeline_metrics[
                    "retrieved_count"
                ]
            ),
            reranked_count=(
                pipeline_metrics[
                    "reranked_count"
                ]
            ),
            retrieval_seconds=(
                pipeline_metrics[
                    "retrieval_seconds"
                ]
            ),
            reranking_seconds=(
                pipeline_metrics[
                    "reranking_seconds"
                ]
            ),
            generation_metrics=(
                generation_metrics
            ),
            total_seconds=(
                pipeline_metrics[
                    "total_seconds"
                ]
            ),
        )

    except KeyboardInterrupt:
        print()
        print(
            "RAG execution cancelled "
            "by the user."
        )

    except Exception as error:
        print()
        print("=" * 80)
        print("RAG PIPELINE ERROR")
        print("=" * 80)
        print(str(error))

        raise

    finally:
        close_ollama_client()

        print()
        print(
            "Weaviate and Ollama "
            "connections closed."
        )


if __name__ == "__main__":
    main()