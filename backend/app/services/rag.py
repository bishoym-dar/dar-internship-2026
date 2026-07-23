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

EMBEDDING_MODEL_NAME = "BAAI/bge-small-en-v1.5"
VECTOR_DATABASE_NAME = "Weaviate"
RETRIEVAL_TOP_K = 15
RERANKER_MODEL_NAME = "BAAI/bge-reranker-v2-m3"
FINAL_CONTEXT_DOCUMENTS = 5


# ---------------------------------------------------------------------------
# OUTPUT HELPERS
# ---------------------------------------------------------------------------

def print_header(title: str) -> None:
    """Print a consistent section header."""

    print()
    print("=" * 80)
    print(title)
    print("=" * 80)


def print_step(step_number: int, title: str) -> None:
    """Print one pipeline-stage heading."""

    print()
    print(f"STEP {step_number}/3 - {title}")
    print("-" * 80)


def print_sources(source_labels: list[str]) -> None:
    """Print the source labels used during generation."""

    print()
    print("Sources Used")
    print("-" * 80)

    if not source_labels:
        print("No source labels were returned.")
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
    """Print performance and model information for the complete pipeline."""

    print_header("RAG PIPELINE SUMMARY")

    print(f"Embedding model : {EMBEDDING_MODEL_NAME}")
    print(f"Vector DB       : {VECTOR_DATABASE_NAME}")
    print(f"Retriever       : Top-{RETRIEVAL_TOP_K}")
    print(f"Reranker        : {RERANKER_MODEL_NAME}")
    print(f"Generator       : {generation_metrics['model']}")

    print()
    print(f"Retrieved chunks : {retrieved_count}")
    print(f"Reranked chunks  : {reranked_count}")

    print()
    print(f"Retrieval time : {retrieval_seconds:.3f} s")
    print(f"Reranking time : {reranking_seconds:.3f} s")
    print(
        f"Generation time: "
        f"{generation_metrics['generation_seconds']:.3f} s"
    )
    print(f"Total time     : {total_seconds:.3f} s")

    prompt_tokens = generation_metrics.get("prompt_tokens")
    generated_tokens = generation_metrics.get("generated_tokens")

    if prompt_tokens is not None or generated_tokens is not None:
        print()
        print(f"Prompt tokens    : {prompt_tokens}")
        print(f"Generated tokens : {generated_tokens}")

    print_sources(
        generation_metrics.get("source_labels", [])
    )


# ---------------------------------------------------------------------------
# MAIN RAG PIPELINE
# ---------------------------------------------------------------------------

def run_rag_pipeline(question: str) -> tuple[str, dict[str, Any]]:
    """
    Run the complete RAG pipeline for one user question.

    Pipeline:
        1. Retrieve the configured number of candidate chunks from Weaviate.
        2. Rerank the candidates and keep the highest-scoring chunks.
        3. Generate a grounded answer with Qwen through Ollama.
    """

    clean_question = question.strip()

    if not clean_question:
        raise ValueError("The question cannot be empty.")

    overall_start = time.perf_counter()

    client = None

    try:
        print_step(1, "RETRIEVAL")

        client = connect_to_weaviate()

        retriever = create_retriever(
            client=client,
            top_k=RETRIEVAL_TOP_K,
        )

        retrieved_documents, retrieval_time = retrieve_top_k(
            retriever=retriever,
            question=clean_question,
        )

        if not retrieved_documents:
            raise RuntimeError(
                "Retrieval returned no document chunks."
            )

        print(
            f"Retrieved {len(retrieved_documents)} chunks "
            f"in {retrieval_time:.3f} seconds."
        )

        print_step(2, "RERANKING")

        reranker = BGEReranker()

        reranked_documents, reranking_time = rerank_documents(
            question=clean_question,
            documents=retrieved_documents,
            reranker=reranker,
            top_n=FINAL_CONTEXT_DOCUMENTS,
        )

        if not reranked_documents:
            raise RuntimeError(
                "Reranking returned no document chunks."
            )

        print(
            f"Selected {len(reranked_documents)} "
            f"highest-scoring chunks "
            f"in {reranking_time:.3f} seconds."
        )

        print_step(3, "GENERATION")

        answer, generation_metrics = generate_answer(
            question=clean_question,
            documents=reranked_documents,
        )

        total_time = time.perf_counter() - overall_start

        pipeline_metrics: dict[str, Any] = {
            "question": clean_question,
            "retrieved_count": len(retrieved_documents),
            "reranked_count": len(reranked_documents),
            "retrieval_seconds": retrieval_time,
            "reranking_seconds": reranking_time,
            "generation": generation_metrics,
            "total_seconds": total_time,
        }

        return answer, pipeline_metrics

    finally:
        if client is not None:
            client.close()


def stream_rag_pipeline(question: str) -> Iterator[str]:
    """
    Run retrieval and reranking, then stream the generated answer.

    The Weaviate client stays open while retrieval and reranking run and is
    closed before generation begins. Ollama text chunks are yielded as soon
    as they are produced.
    """

    clean_question = question.strip()

    if not clean_question:
        raise ValueError("The question cannot be empty.")

    client = None

    try:
        print_step(1, "RETRIEVAL")

        client = connect_to_weaviate()

        retriever = create_retriever(
            client=client,
            top_k=RETRIEVAL_TOP_K,
        )

        retrieved_documents, retrieval_time = retrieve_top_k(
            retriever=retriever,
            question=clean_question,
        )

        if not retrieved_documents:
            raise RuntimeError(
                "Retrieval returned no document chunks."
            )

        print(
            f"Retrieved {len(retrieved_documents)} chunks "
            f"in {retrieval_time:.3f} seconds."
        )

        print_step(2, "RERANKING")

        reranker = BGEReranker()

        reranked_documents, reranking_time = rerank_documents(
            question=clean_question,
            documents=retrieved_documents,
            reranker=reranker,
            top_n=FINAL_CONTEXT_DOCUMENTS,
        )

        if not reranked_documents:
            raise RuntimeError(
                "Reranking returned no document chunks."
            )

        print(
            f"Selected {len(reranked_documents)} "
            f"highest-scoring chunks "
            f"in {reranking_time:.3f} seconds."
        )

    finally:
        if client is not None:
            client.close()

    print_step(3, "GENERATION")

    yield from stream_answer(
        question=clean_question,
        documents=reranked_documents,
    )


# ---------------------------------------------------------------------------
# TERMINAL APPLICATION
# ---------------------------------------------------------------------------

def main() -> None:
    """Run the local CIS Controls RAG system from the terminal."""

    print_header("CIS CONTROLS RAG SYSTEM")

    verify_ollama()

    question = input("Ask a question: ").strip()

    try:
        answer, pipeline_metrics = run_rag_pipeline(question)

        print_header("FINAL ANSWER")
        print()
        print(answer)

        generation_metrics = pipeline_metrics["generation"]

        print_pipeline_summary(
            retrieved_count=pipeline_metrics["retrieved_count"],
            reranked_count=pipeline_metrics["reranked_count"],
            retrieval_seconds=pipeline_metrics["retrieval_seconds"],
            reranking_seconds=pipeline_metrics["reranking_seconds"],
            generation_metrics=generation_metrics,
            total_seconds=pipeline_metrics["total_seconds"],
        )

    except KeyboardInterrupt:
        print()
        print("RAG execution cancelled by the user.")

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
        print("Weaviate and Ollama connections closed.")


# ---------------------------------------------------------------------------
# ENTRY POINT
# ---------------------------------------------------------------------------

if __name__ == "__main__":
    main()