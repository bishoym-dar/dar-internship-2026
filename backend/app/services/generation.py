from __future__ import annotations

import time
from pathlib import Path
from typing import Any, Sequence

from ollama import Client
from langchain_core.documents import Document

OLLAMA_CLIENT = Client(
    host="http://127.0.0.1:11434",
)

# ---------------------------------------------------------------------------
# PROJECT CONFIGURATION
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = PROJECT_ROOT / "output"

MODEL_NAME = "qwen2.5:3b"

# Keep the model loaded in memory briefly so repeated questions are faster.
KEEP_ALIVE = "10m"

# Generation settings.
TEMPERATURE = 0.1
TOP_P = 0.9
MAX_OUTPUT_TOKENS = 2000

# Maximum number of reranked documents given to the LLM.
MAX_CONTEXT_DOCUMENTS = 5

GENERATION_RESULTS_FILE = OUTPUT_DIR / "generation_results.txt"


# ---------------------------------------------------------------------------
# OLLAMA CONNECTION
# ---------------------------------------------------------------------------

def verify_ollama() -> None:
    """
    Confirm that Ollama is running and the configured model is installed.
    """

    try:
        response = OLLAMA_CLIENT.list()
    except Exception as error:
        raise ConnectionError(
            "\nCould not connect to Ollama.\n\n"
            "Confirm that the Ollama service is running at "
            "http://127.0.0.1:11434."
        ) from error

    installed_models: list[str] = []

    # Support both object-style and dictionary-style responses.
    models = getattr(response, "models", None)

    if models is None and isinstance(response, dict):
        models = response.get("models", [])

    for model in models or []:
        model_name = getattr(model, "model", None)

        if model_name is None and isinstance(model, dict):
            model_name = model.get("model") or model.get("name")

        if model_name:
            installed_models.append(str(model_name))

    if not any(
        name == MODEL_NAME or name.startswith(f"{MODEL_NAME}:")
        for name in installed_models
    ):
        raise RuntimeError(
            f"\nThe model {MODEL_NAME!r} is not installed.\n\n"
            f"Installed models: {installed_models}\n\n"
            f"Install it with:\nollama pull {MODEL_NAME}"
        )


# ---------------------------------------------------------------------------
# DOCUMENT HELPERS
# ---------------------------------------------------------------------------

def get_document_text(document: Any) -> str:
    """Extract text from a LangChain Document or dictionary."""

    if isinstance(document, Document):
        return document.page_content.strip()

    if isinstance(document, dict):
        content = (
            document.get("page_content")
            or document.get("text")
            or document.get("content")
            or ""
        )
        return str(content).strip()

    return str(document).strip()


def get_document_metadata(document: Any) -> dict[str, Any]:
    """Extract metadata safely."""

    if isinstance(document, Document):
        return dict(document.metadata)

    if isinstance(document, dict):
        metadata = document.get("metadata", {})

        if isinstance(metadata, dict):
            return dict(metadata)

    return {}


def build_source_label(
    metadata: dict[str, Any],
    source_number: int,
) -> str:
    """Create a readable source label for the prompt and final answer."""

    chunk_id = metadata.get("chunk_id", "Unknown")
    section = metadata.get("section_title") or "Unknown section"
    page_start = metadata.get("page_start")
    page_end = metadata.get("page_end")

    if page_start is not None and page_end is not None:
        if page_start == page_end:
            page_text = f"page {page_start}"
        else:
            page_text = f"pages {page_start}-{page_end}"
    elif page_start is not None:
        page_text = f"page {page_start}"
    else:
        page_text = "page unknown"

    return (
        f"Source {source_number} | "
        f"Chunk {chunk_id} | "
        f"{section} | "
        f"{page_text}"
    )


# ---------------------------------------------------------------------------
# CONTEXT BUILDING
# ---------------------------------------------------------------------------

def build_context(
    documents: Sequence[Any],
    maximum_documents: int = MAX_CONTEXT_DOCUMENTS,
) -> tuple[str, list[str]]:
    """
    Format reranked documents into a clear context block.

    Returns:
        context:
            Text supplied to Qwen.

        source_labels:
            Human-readable references used for reporting.
    """

    selected_documents = list(documents[:maximum_documents])

    if not selected_documents:
        raise ValueError(
            "No documents were provided for generation."
        )

    context_parts: list[str] = []
    source_labels: list[str] = []

    for source_number, document in enumerate(
        selected_documents,
        start=1,
    ):
        text = get_document_text(document)
        metadata = get_document_metadata(document)

        if not text:
            continue

        source_label = build_source_label(
            metadata=metadata,
            source_number=source_number,
        )

        source_labels.append(source_label)

        context_parts.append(
            f"[{source_label}]\n{text}"
        )

    if not context_parts:
        raise ValueError(
            "The supplied documents contained no usable text."
        )

    context = "\n\n".join(context_parts)

    return context, source_labels


# ---------------------------------------------------------------------------
# PROMPT
# ---------------------------------------------------------------------------

def build_messages(
    question: str,
    context: str,
) -> list[dict[str, str]]:
    """Create a grounded RAG prompt for Qwen."""

    system_message = """
You are a professional cybersecurity assistant specializing in the CIS Controls.

Answer the user's question using ONLY the retrieved CIS context.

STRICT RULES:
- Give only the final answer intended for the user.
- Do not reveal reasoning, analysis, planning, notes, or intermediate steps.
- Do not describe how you searched, compared, or combined the sources.
- Do not restate the question.
- Answer naturally and directly, like a chatbot.
- Combine relevant evidence into one clear response.
- Cite supporting evidence using [Source 1], [Source 2], and similar labels.
- Keep the answer concise and professional.
- If the context is insufficient, reply exactly:
  "The retrieved context does not contain enough information to answer this question."
""".strip()

    user_message = f"""
QUESTION
{question}

RETRIEVED CIS CONTEXT
{context}

Give only the final answer. Do not include reasoning or analysis.
""".strip()

    return [
        {
            "role": "system",
            "content": system_message,
        },
        {
            "role": "user",
            "content": user_message,
        },
    ]


# ---------------------------------------------------------------------------
# GENERATION
# ---------------------------------------------------------------------------

def generate_answer(
    question: str,
    documents: Sequence[Any],
) -> tuple[str, dict[str, Any]]:
    """
    Generate one grounded answer using the configured model through Ollama.

    The selected model is a standard non-thinking instruction model.
    """

    clean_question = question.strip()

    if not clean_question:
        raise ValueError("The question cannot be empty.")

    context, source_labels = build_context(documents)
    messages = build_messages(
        question=clean_question,
        context=context,
    )

    started_at = time.perf_counter()

    try:
        response = OLLAMA_CLIENT.chat(
            model=MODEL_NAME,
            messages=messages,

            stream=False,
            keep_alive=KEEP_ALIVE,

            options={
                "temperature": TEMPERATURE,
                "top_p": TOP_P,
                "num_predict": MAX_OUTPUT_TOKENS,
                "num_ctx": 8192,
            },
        )
    except Exception as error:
        raise RuntimeError(
            "\nOllama generation failed.\n\n"
            f"Model: {MODEL_NAME}\n"
            f"Original error: {error}"
        ) from error

    duration = time.perf_counter() - started_at

    answer = response.message.content.strip()

    if not answer:
        raise RuntimeError(
            "Ollama returned an empty answer."
        )

    metrics = {
        "model": MODEL_NAME,
        "thinking_enabled": False,
        "context_documents": len(source_labels),
        "generation_seconds": round(duration, 4),
        "prompt_tokens": getattr(
            response,
            "prompt_eval_count",
            None,
        ),
        "generated_tokens": getattr(
            response,
            "eval_count",
            None,
        ),
        "source_labels": source_labels,
    }

    return answer, metrics



# ---------------------------------------------------------------------------
# CLEANUP
# ---------------------------------------------------------------------------

def close_ollama_client() -> None:
    """Close Ollama's underlying HTTP connection."""
    OLLAMA_CLIENT.close()


# ---------------------------------------------------------------------------
# OUTPUT
# ---------------------------------------------------------------------------

def print_answer(
    question: str,
    answer: str,
    metrics: dict[str, Any],
) -> None:
    """Print a presentation-friendly answer."""

    print()
    print("=" * 80)
    print("GENERATED ANSWER")
    print("=" * 80)
    print(f"Question: {question}")
    print(f"Model:    {metrics['model']}")
    print("Mode:       standard chat")
    print(
        f"Context documents: "
        f"{metrics['context_documents']}"
    )
    print(
        f"Generation time: "
        f"{metrics['generation_seconds']} seconds"
    )
    print()
    print(answer)
    print()


def save_answer(
    question: str,
    answer: str,
    metrics: dict[str, Any],
    output_path: Path = GENERATION_RESULTS_FILE,
) -> None:
    """Save the generated answer and source information."""

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with output_path.open(
        "w",
        encoding="utf-8",
    ) as output_file:
        output_file.write("RAG GENERATION RESULT\n")
        output_file.write("=" * 100 + "\n\n")

        output_file.write(f"Question: {question}\n")
        output_file.write(
            f"Model: {metrics['model']}\n"
        )
        output_file.write("Mode: standard chat\n")
        output_file.write(
            f"Context documents: "
            f"{metrics['context_documents']}\n"
        )
        output_file.write(
            f"Generation time: "
            f"{metrics['generation_seconds']} seconds\n"
        )
        output_file.write(
            f"Prompt tokens: "
            f"{metrics['prompt_tokens']}\n"
        )
        output_file.write(
            f"Generated tokens: "
            f"{metrics['generated_tokens']}\n\n"
        )

        output_file.write("ANSWER\n")
        output_file.write("-" * 100 + "\n")
        output_file.write(answer)
        output_file.write("\n\n")

        output_file.write("SOURCES PROVIDED TO THE MODEL\n")
        output_file.write("-" * 100 + "\n")

        for source_label in metrics["source_labels"]:
            output_file.write(f"- {source_label}\n")

    print(f"Generation result saved to: {output_path}")


# ---------------------------------------------------------------------------
# STANDALONE TEST
# ---------------------------------------------------------------------------

def main() -> None:
    """
    Test generation independently before connecting the full RAG pipeline.

    These sample documents are temporary. The final rag.py file will supply
    real reranked documents retrieved from Weaviate.
    """

    print("=" * 80)
    print("LOCAL RAG GENERATION TEST")
    print("=" * 80)

    verify_ollama()

    question = input("Enter a test question: ").strip()

    # Temporary test context only.
    # This verifies the Ollama connection and standard chat generation.
    test_documents = [
        Document(
            page_content=(
                "Organizations should actively manage an inventory of "
                "enterprise assets connected to the infrastructure, "
                "including end-user devices, network devices, servers, "
                "and non-computing or IoT devices."
            ),
            metadata={
                "chunk_id": 1,
                "section_title": (
                    "Inventory and Control of Enterprise Assets"
                ),
                "page_start": 15,
                "page_end": 15,
            },
        ),
        Document(
            page_content=(
                "The enterprise asset inventory should be detailed, "
                "accurate, and maintained so unauthorized or unmanaged "
                "assets can be identified and addressed."
            ),
            metadata={
                "chunk_id": 2,
                "section_title": (
                    "Inventory and Control of Enterprise Assets"
                ),
                "page_start": 16,
                "page_end": 16,
            },
        ),
    ]

    answer, metrics = generate_answer(
        question=question,
        documents=test_documents,
    )

    print_answer(
        question=question,
        answer=answer,
        metrics=metrics,
    )

    save_answer(
        question=question,
        answer=answer,
        metrics=metrics,
    )


if __name__ == "__main__":
    main()