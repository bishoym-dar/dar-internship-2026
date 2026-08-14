from __future__ import annotations

import re
import time
from collections.abc import Iterator, Sequence
from pathlib import Path
from typing import Any, Iterable

from langchain_core.documents import Document
from ollama import Client


OLLAMA_CLIENT = Client(
    host="http://127.0.0.1:11434",
)

# ---------------------------------------------------------------------------
# PROJECT CONFIGURATION
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = PROJECT_ROOT / "output"

MODEL_NAME = "qwen2.5:3b"
KEEP_ALIVE = "10m"

TEMPERATURE = 0.1
TOP_P = 0.9
MAX_OUTPUT_TOKENS = 2000
MAX_CONTEXT_DOCUMENTS = 5
MAX_CORRECTION_ATTEMPTS = 1
STREAM_CHUNK_SIZE = 32

GENERATION_RESULTS_FILE = OUTPUT_DIR / "generation_results.txt"

INSUFFICIENT_CONTEXT_MESSAGE = (
    "The retrieved context does not contain enough information "
    "to answer this question."
)

INVALID_ANSWER_MESSAGE = (
    "The answer could not be generated with valid source citations. "
    "Please try again."
)


# ---------------------------------------------------------------------------
# OLLAMA CONNECTION
# ---------------------------------------------------------------------------


def verify_ollama() -> None:
    """Confirm that Ollama is running and the configured model is installed."""

    try:
        response = OLLAMA_CLIENT.list()
    except Exception as error:
        raise ConnectionError(
            "\nCould not connect to Ollama.\n\n"
            "Confirm that the Ollama service is running at "
            "http://127.0.0.1:11434."
        ) from error

    installed_models: list[str] = []
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
    """Create a readable source label for logs and saved generation results."""

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
    """Format reranked documents into a numbered context block."""

    selected_documents = list(documents[:maximum_documents])

    if not selected_documents:
        raise ValueError("No documents were provided for generation.")

    context_parts: list[str] = []
    source_labels: list[str] = []
    source_number = 0

    for document in selected_documents:
        text = get_document_text(document)

        if not text:
            continue

        source_number += 1
        metadata = get_document_metadata(document)
        source_label = build_source_label(
            metadata=metadata,
            source_number=source_number,
        )
        source_labels.append(source_label)

        # The citation identifier is deliberately isolated from metadata.
        # This strongly encourages the model to cite only [Source X].
        context_parts.append(
            "\n".join(
                [
                    f"CITATION IDENTIFIER: [Source {source_number}]",
                    f"SOURCE METADATA: {source_label}",
                    "SOURCE CONTENT:",
                    text,
                ]
            )
        )

    if not context_parts:
        raise ValueError("The supplied documents contained no usable text.")

    return "\n\n---\n\n".join(context_parts), source_labels


# ---------------------------------------------------------------------------
# PROMPT
# ---------------------------------------------------------------------------


SYSTEM_MESSAGE = f"""
You are a professional cybersecurity assistant specializing in the CIS Controls.

Answer the user's question using ONLY the retrieved CIS context.

GROUNDING RULES:
- Use only information explicitly present in the retrieved context.
- Never add external knowledge, assumptions, common practices, or information from memory.
- If only part of the question is supported, answer only that part.
- If the context does not support an answer, return exactly:
  {INSUFFICIENT_CONTEXT_MESSAGE}

CITATION RULES — NON-NEGOTIABLE:
- Every factual sentence or factual bullet derived from context MUST end with a citation.
- Use ONLY this exact citation format: [Source X]
- X must be a source number present in the retrieved context.
- Never put chunk IDs, pages, titles, filenames, sections, colons, pipes, or other metadata inside citations.
- Never put citations in parentheses.
- Never invent source numbers.
- If multiple sources support one claim, write separate markers: [Source 1] [Source 2]
- Forbidden examples include:
  (Source 1)
  [Source 1 | Chunk 65]
  Source 1 · Chunk 65
  (Source 1: page 20)
  [Source 1: title]

RESPONSE STYLE:
- Give only the final user-facing answer.
- Do not reveal reasoning, planning, retrieval steps, or internal analysis.
- Do not restate the user's question.
- Start with the direct answer.
- Write clearly, naturally, and professionally.
- Keep paragraphs short, usually 1–3 sentences.
- Never return one large paragraph when the answer contains multiple ideas.
- Avoid filler, repetition, generic introductions, and generic conclusions.

MARKDOWN STRUCTURE:
- Use Markdown whenever it improves readability.
- For detailed answers, begin with one short descriptive ## heading.
- Use ## headings to separate genuinely different sections.
- Use bullet points whenever there are two or more distinct facts, requirements, risks, benefits, safeguards, recommendations, or examples.
- Use numbered lists only for ordered steps or procedures.
- Use a Markdown table only when comparison is clearer in a table.
- Bold important CIS Control names, safeguard IDs, cybersecurity terms, and key requirements.
- Use inline code for commands, filenames, paths, configuration values, and technical identifiers.
- A short, single-point answer may be one concise paragraph.
- A multi-point answer MUST use headings and/or bullets.

FINAL SELF-CHECK:
- Every factual sentence or bullet has [Source X].
- No forbidden citation format appears.
- Every cited source number exists in the supplied context.
- The answer is structured and not a large paragraph when it contains multiple ideas.
- If any check fails, silently correct it before responding.
""".strip()


def build_messages(
    question: str,
    context: str,
    correction_request: str | None = None,
) -> list[dict[str, str]]:
    """Create a grounded RAG prompt for Qwen."""

    correction_section = ""

    if correction_request:
        correction_section = f"""

CORRECTION REQUIRED
{correction_request}
Rewrite the answer completely. Return only the corrected final answer.
""".rstrip()

    user_message = f"""
QUESTION
{question}

RETRIEVED CIS CONTEXT
{context}
{correction_section}

Return only the final answer in valid Markdown.
Use citations only as [Source X].
""".strip()

    return [
        {
            "role": "system",
            "content": SYSTEM_MESSAGE,
        },
        {
            "role": "user",
            "content": user_message,
        },
    ]


# ---------------------------------------------------------------------------
# CITATION NORMALIZATION AND VALIDATION
# ---------------------------------------------------------------------------


def normalize_citations(answer: str) -> str:
    """Convert common model citation variants into the exact [Source X] form."""

    normalized = answer

    patterns = [
        r"\(\s*Source\s+(\d+)\s*:\s*\[[^\]]+\]\s*\)",
        r"\(\s*Source\s+(\d+)\s*:[^)]+\)",
        r"\[\s*Source\s+(\d+)\s*\|[^\]]+\]",
        r"\[\s*Source\s+(\d+)\s*:[^\]]+\]",
        r"\(\s*Source\s+(\d+)\s*\)",
        r"Source\s+(\d+)\s*[·|]\s*Chunk\s+[A-Za-z0-9_-]+",
    ]

    for pattern in patterns:
        normalized = re.sub(
            pattern,
            r"[Source \1]",
            normalized,
            flags=re.IGNORECASE,
        )

    normalized = re.sub(
        r"\[\s*source\s+(\d+)\s*\]",
        r"[Source \1]",
        normalized,
        flags=re.IGNORECASE,
    )

    normalized = re.sub(
        r"(\[Source\s+\d+\])(?:\s+\1)+",
        r"\1",
        normalized,
        flags=re.IGNORECASE,
    )

    return normalized.strip()


def extract_citation_numbers(answer: str) -> set[int]:
    """Return all source numbers cited with the valid citation format."""

    return {
        int(number)
        for number in re.findall(
            r"\[Source\s+(\d+)\]",
            answer,
            flags=re.IGNORECASE,
        )
    }


def has_invalid_citation_format(answer: str) -> bool:
    """Detect citation-like text that is not in the exact [Source X] format."""

    invalid_patterns = [
        r"\(\s*Source\s+\d+",
        r"\[Source\s+\d+\s*[|:]",
        r"Source\s+\d+\s*·\s*Chunk",
    ]

    return any(
        re.search(pattern, answer, flags=re.IGNORECASE)
        for pattern in invalid_patterns
    )


def looks_like_large_unstructured_paragraph(answer: str) -> bool:
    """Flag long answers that ignore the required Markdown structure."""

    if len(answer) < 550:
        return False

    has_heading = bool(re.search(r"(?m)^##\s+\S", answer))
    has_bullets = bool(re.search(r"(?m)^[-*]\s+\S", answer))
    has_numbered_steps = bool(re.search(r"(?m)^\d+\.\s+\S", answer))

    return not (has_heading or has_bullets or has_numbered_steps)


def validate_answer(
    answer: str,
    available_source_numbers: Iterable[int],
) -> tuple[bool, list[str]]:
    """Validate citation format, source IDs, and basic response structure."""

    clean_answer = answer.strip()

    if clean_answer == INSUFFICIENT_CONTEXT_MESSAGE:
        return True, []

    problems: list[str] = []
    available_sources = set(available_source_numbers)
    used_sources = extract_citation_numbers(clean_answer)

    if has_invalid_citation_format(clean_answer):
        problems.append("The answer contains a forbidden citation format.")

    if not used_sources:
        problems.append("The answer contains no [Source X] citations.")

    unavailable_sources = used_sources - available_sources

    if unavailable_sources:
        unavailable_text = ", ".join(
            str(number) for number in sorted(unavailable_sources)
        )
        problems.append(
            f"The answer cites unavailable source numbers: {unavailable_text}."
        )

    if looks_like_large_unstructured_paragraph(clean_answer):
        problems.append(
            "The answer is a large paragraph and must use headings or bullets."
        )

    return not problems, problems


# ---------------------------------------------------------------------------
# GENERATION
# ---------------------------------------------------------------------------


def _ollama_chat(messages: list[dict[str, str]]) -> Any:
    """Run one non-streaming Ollama chat request."""

    return OLLAMA_CLIENT.chat(
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


def _extract_response_text(response: Any) -> str:
    """Read response text from object-style or dictionary-style Ollama output."""

    message = getattr(response, "message", None)

    if message is not None:
        content = getattr(message, "content", "")
    elif isinstance(response, dict):
        content = response.get("message", {}).get("content", "")
    else:
        content = ""

    return str(content).strip()


def _generate_validated_answer(
    question: str,
    context: str,
    source_count: int,
) -> tuple[str, Any, int, list[str]]:
    """Generate, normalize, validate, and retry once if needed."""

    correction_request: str | None = None
    last_response: Any = None
    last_problems: list[str] = []

    for attempt in range(MAX_CORRECTION_ATTEMPTS + 1):
        messages = build_messages(
            question=question,
            context=context,
            correction_request=correction_request,
        )

        last_response = _ollama_chat(messages)
        raw_answer = _extract_response_text(last_response)

        if not raw_answer:
            last_problems = ["Ollama returned an empty answer."]
        else:
            normalized_answer = normalize_citations(raw_answer)
            is_valid, problems = validate_answer(
                normalized_answer,
                range(1, source_count + 1),
            )

            if is_valid:
                return normalized_answer, last_response, attempt, []

            last_problems = problems

        correction_request = "\n".join(
            [
                "The previous answer failed validation:",
                *[f"- {problem}" for problem in last_problems],
                "Required corrections:",
                "- Use only citations in the exact form [Source X].",
                f"- Use only source numbers 1 through {source_count}.",
                "- Add a citation to every factual sentence or bullet.",
                "- Remove chunk IDs, pages, titles, and citation parentheses.",
                "- Use headings and bullets for a multi-point or long answer.",
            ]
        )

    return INVALID_ANSWER_MESSAGE, last_response, MAX_CORRECTION_ATTEMPTS, last_problems


def generate_answer(
    question: str,
    documents: Sequence[Any],
) -> tuple[str, dict[str, Any]]:
    """Generate a grounded, normalized, and validated answer."""

    clean_question = question.strip()

    if not clean_question:
        raise ValueError("The question cannot be empty.")

    context, source_labels = build_context(documents)
    started_at = time.perf_counter()

    try:
        answer, response, retry_count, validation_problems = (
            _generate_validated_answer(
                question=clean_question,
                context=context,
                source_count=len(source_labels),
            )
        )
    except Exception as error:
        raise RuntimeError(
            "\nOllama generation failed.\n\n"
            f"Model: {MODEL_NAME}\n"
            f"Original error: {error}"
        ) from error

    duration = time.perf_counter() - started_at

    metrics = {
        "model": MODEL_NAME,
        "thinking_enabled": False,
        "context_documents": len(source_labels),
        "generation_seconds": round(duration, 4),
        "prompt_tokens": getattr(response, "prompt_eval_count", None),
        "generated_tokens": getattr(response, "eval_count", None),
        "source_labels": source_labels,
        "citation_retry_count": retry_count,
        "validation_problems": validation_problems,
    }

    return answer, metrics


def chunk_text(text: str, chunk_size: int = STREAM_CHUNK_SIZE) -> Iterator[str]:
    """Yield cleaned text in small chunks for the existing SSE interface."""

    if chunk_size <= 0:
        raise ValueError("chunk_size must be greater than zero.")

    for start in range(0, len(text), chunk_size):
        yield text[start:start + chunk_size]


def stream_answer(
    question: str,
    documents: Sequence[Any],
) -> Iterator[str]:
    """
    Generate the full answer first, normalize and validate it, then stream the
    cleaned result in small chunks. This prevents malformed citations from
    reaching the browser during the supervisor demo.
    """

    clean_question = question.strip()

    if not clean_question:
        raise ValueError("The question cannot be empty.")

    context, source_labels = build_context(documents)

    try:
        print("Generating and validating answer with Ollama...")

        answer, _response, retry_count, validation_problems = (
            _generate_validated_answer(
                question=clean_question,
                context=context,
                source_count=len(source_labels),
            )
        )

        print(
            "Answer validation complete. "
            f"Retries: {retry_count}. "
            f"Problems after final attempt: {validation_problems}"
        )

        if not answer:
            raise RuntimeError("Ollama returned an empty answer.")

        for chunk in chunk_text(answer):
            yield chunk

    except Exception as error:
        raise RuntimeError(
            "\nOllama generation failed.\n\n"
            f"Model: {MODEL_NAME}\n"
            f"Original error: {error}"
        ) from error


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
    print(f"Context documents: {metrics['context_documents']}")
    print(f"Generation time: {metrics['generation_seconds']} seconds")
    print(f"Citation retries: {metrics.get('citation_retry_count', 0)}")
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

    output_path.parent.mkdir(parents=True, exist_ok=True)

    with output_path.open("w", encoding="utf-8") as output_file:
        output_file.write("RAG GENERATION RESULT\n")
        output_file.write("=" * 100 + "\n\n")
        output_file.write(f"Question: {question}\n")
        output_file.write(f"Model: {metrics['model']}\n")
        output_file.write("Mode: standard chat\n")
        output_file.write(
            f"Context documents: {metrics['context_documents']}\n"
        )
        output_file.write(
            f"Generation time: {metrics['generation_seconds']} seconds\n"
        )
        output_file.write(f"Prompt tokens: {metrics['prompt_tokens']}\n")
        output_file.write(
            f"Generated tokens: {metrics['generated_tokens']}\n"
        )
        output_file.write(
            f"Citation retries: {metrics.get('citation_retry_count', 0)}\n\n"
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
    """Test generation independently before connecting the full RAG pipeline."""

    print("=" * 80)
    print("LOCAL RAG GENERATION TEST")
    print("=" * 80)

    verify_ollama()
    question = input("Enter a test question: ").strip()

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
                "section_title": "Inventory and Control of Enterprise Assets",
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
                "section_title": "Inventory and Control of Enterprise Assets",
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