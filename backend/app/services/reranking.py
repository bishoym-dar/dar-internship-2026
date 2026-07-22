from __future__ import annotations

import math
import time
from pathlib import Path
from typing import Sequence

import torch
from langchain_core.documents import Document
from transformers import (
    AutoModelForSequenceClassification,
    AutoTokenizer,
)


# ---------------------------------------------------------------------------
# PROJECT CONFIGURATION
# ---------------------------------------------------------------------------

PROJECT_ROOT = Path(__file__).resolve().parent
OUTPUT_DIR = PROJECT_ROOT / "output"

RERANKER_MODEL_NAME = "BAAI/bge-reranker-v2-m3"

# retrieval.py returns 50 candidates.
EXPECTED_RETRIEVED_CANDIDATES = 15

# Only the strongest chunks are sent to Qwen.
FINAL_TOP_N = 5

# CPU-safe settings.
DEVICE = "cpu"
BATCH_SIZE = 4
MAX_SEQUENCE_LENGTH = 512

RERANKING_RESULTS_FILE = OUTPUT_DIR / "reranking_results.txt"


# ---------------------------------------------------------------------------
# RERANKER MODEL
# ---------------------------------------------------------------------------

class BGEReranker:
    """
    Local cross-encoder reranker using BAAI/bge-reranker-v2-m3.

    Unlike an embedding model, the reranker reads the question and one
    passage together, then returns a direct relevance score.
    """

    def __init__(
        self,
        model_name: str = RERANKER_MODEL_NAME,
        device: str = DEVICE,
        batch_size: int = BATCH_SIZE,
        max_length: int = MAX_SEQUENCE_LENGTH,
    ) -> None:
        self.model_name = model_name
        self.device = torch.device(device)
        self.batch_size = batch_size
        self.max_length = max_length

        print("Loading reranker tokenizer...")
        self.tokenizer = AutoTokenizer.from_pretrained(
            self.model_name
        )

        print("Loading reranker model...")
        self.model = (
            AutoModelForSequenceClassification
            .from_pretrained(self.model_name)
            .to(self.device)
        )

        self.model.eval()

        print(f"Reranker loaded: {self.model_name}")
        print(f"Device: {self.device}")

    @staticmethod
    def sigmoid(value: float) -> float:
        """Convert a raw reranker score to the range 0–1."""

        # Numerically stable sigmoid.
        if value >= 0:
            return 1.0 / (1.0 + math.exp(-value))

        exponential = math.exp(value)
        return exponential / (1.0 + exponential)

    def score_documents(
        self,
        question: str,
        documents: Sequence[Document],
    ) -> list[float]:
        """
        Score every question–document pair.

        Returns normalized relevance scores between 0 and 1.
        """

        clean_question = question.strip()

        if not clean_question:
            raise ValueError("The question cannot be empty.")

        if not documents:
            raise ValueError(
                "No documents were supplied to the reranker."
            )

        all_scores: list[float] = []

        for start_index in range(
            0,
            len(documents),
            self.batch_size,
        ):
            batch_documents = documents[
                start_index:start_index + self.batch_size
            ]

            passages = [
                document.page_content.strip()
                for document in batch_documents
            ]

            questions = [
                clean_question
                for _ in passages
            ]

            encoded = self.tokenizer(
                questions,
                passages,
                padding=True,
                truncation=True,
                max_length=self.max_length,
                return_tensors="pt",
            )

            encoded = {
                key: value.to(self.device)
                for key, value in encoded.items()
            }

            with torch.inference_mode():
                output = self.model(
                    **encoded,
                    return_dict=True,
                )

                raw_scores = (
                    output.logits
                    .view(-1)
                    .float()
                    .cpu()
                    .tolist()
                )

            normalized_scores = [
                self.sigmoid(float(score))
                for score in raw_scores
            ]

            all_scores.extend(normalized_scores)

            processed = min(
                start_index + len(batch_documents),
                len(documents),
            )

            print(
                f"Reranked {processed}/{len(documents)} candidates..."
            )

        if len(all_scores) != len(documents):
            raise RuntimeError(
                "The reranker returned an unexpected number of scores."
            )

        return all_scores


# ---------------------------------------------------------------------------
# RERANKING
# ---------------------------------------------------------------------------

def rerank_documents(
    question: str,
    documents: Sequence[Document],
    reranker: BGEReranker,
    top_n: int = FINAL_TOP_N,
) -> tuple[list[Document], float]:
    """
    Rerank retrieved documents and return the strongest top_n results.

    New metadata fields:
        retrieval_rank
        reranker_rank
        reranker_score
        reranker_model
    """

    if top_n <= 0:
        raise ValueError("top_n must be greater than zero.")

    documents_list = list(documents)

    if not documents_list:
        raise ValueError(
            "No retrieved documents were supplied."
        )

    started_at = time.perf_counter()

    scores = reranker.score_documents(
        question=question,
        documents=documents_list,
    )

    scored_documents: list[
        tuple[float, int, Document]
    ] = []

    for retrieval_rank, (document, score) in enumerate(
        zip(documents_list, scores, strict=True),
        start=1,
    ):
        scored_documents.append(
            (
                score,
                retrieval_rank,
                document,
            )
        )

    # Highest relevance score first.
    scored_documents.sort(
        key=lambda item: item[0],
        reverse=True,
    )

    selected_documents: list[Document] = []

    for reranker_rank, (
        score,
        retrieval_rank,
        document,
    ) in enumerate(
        scored_documents[:top_n],
        start=1,
    ):
        new_metadata = dict(document.metadata)

        new_metadata.update(
            {
                "retrieval_rank": retrieval_rank,
                "reranker_rank": reranker_rank,
                "reranker_score": round(score, 6),
                "reranker_model": reranker.model_name,
            }
        )

        selected_documents.append(
            Document(
                page_content=document.page_content,
                metadata=new_metadata,
            )
        )

    duration = time.perf_counter() - started_at

    return selected_documents, duration


# ---------------------------------------------------------------------------
# TERMINAL OUTPUT
# ---------------------------------------------------------------------------

def print_reranking_results(
    question: str,
    original_count: int,
    documents: Sequence[Document],
    duration: float,
) -> None:
    """Print a concise reranking summary."""

    print()
    print("=" * 80)
    print("RERANKING COMPLETE")
    print("=" * 80)
    print(f"Question:              {question}")
    print(f"Input candidates:      {original_count}")
    print(f"Selected documents:    {len(documents)}")
    print(f"Reranker model:        {RERANKER_MODEL_NAME}")
    print(f"Reranking time:        {duration:.4f} seconds")
    print()

    for document in documents:
        metadata = document.metadata

        preview = (
            document.page_content
            .replace("\n", " ")
            .strip()[:350]
        )

        print(
            f"RERANKED RESULT "
            f"{metadata.get('reranker_rank', 'Unknown')}"
        )
        print(
            f"Score:          "
            f"{metadata.get('reranker_score', 'Unknown')}"
        )
        print(
            f"Original rank:  "
            f"{metadata.get('retrieval_rank', 'Unknown')}"
        )
        print(
            f"Chunk ID:       "
            f"{metadata.get('chunk_id', 'Unknown')}"
        )
        print(
            f"Section:        "
            f"{metadata.get('section_title', 'Unknown')}"
        )
        print(
            f"Pages:          "
            f"{metadata.get('page_start', 'Unknown')} - "
            f"{metadata.get('page_end', 'Unknown')}"
        )
        print(preview)
        print("-" * 80)


# ---------------------------------------------------------------------------
# FILE OUTPUT
# ---------------------------------------------------------------------------

def save_reranking_results(
    question: str,
    original_count: int,
    documents: Sequence[Document],
    duration: float,
    output_path: Path = RERANKING_RESULTS_FILE,
) -> None:
    """Save all final reranked chunks for inspection."""

    output_path.parent.mkdir(
        parents=True,
        exist_ok=True,
    )

    with output_path.open(
        "w",
        encoding="utf-8",
    ) as output_file:
        output_file.write("BGE RERANKING RESULTS\n")
        output_file.write("=" * 100 + "\n\n")

        output_file.write(f"Question: {question}\n")
        output_file.write(
            f"Reranker: {RERANKER_MODEL_NAME}\n"
        )
        output_file.write(
            f"Input candidates: {original_count}\n"
        )
        output_file.write(
            f"Selected documents: {len(documents)}\n"
        )
        output_file.write(
            f"Reranking time: {duration:.4f} seconds\n\n"
        )

        for document in documents:
            metadata = document.metadata

            output_file.write(
                f"RERANKED RESULT "
                f"{metadata.get('reranker_rank', 'Unknown')}\n"
            )
            output_file.write("-" * 100 + "\n")

            output_file.write(
                f"Normalized score: "
                f"{metadata.get('reranker_score', 'Unknown')}\n"
            )
            output_file.write(
                f"Original retrieval rank: "
                f"{metadata.get('retrieval_rank', 'Unknown')}\n"
            )
            output_file.write(
                f"Chunk ID: "
                f"{metadata.get('chunk_id', 'Unknown')}\n"
            )
            output_file.write(
                f"Section: "
                f"{metadata.get('section_title', 'Unknown')}\n"
            )
            output_file.write(
                f"Pages: "
                f"{metadata.get('page_start', 'Unknown')} - "
                f"{metadata.get('page_end', 'Unknown')}\n\n"
            )

            output_file.write(document.page_content)

            output_file.write(
                "\n\n" + "=" * 100 + "\n\n"
            )

    print(
        f"Reranking results saved to: {output_path}"
    )


# ---------------------------------------------------------------------------
# STANDALONE RETRIEVAL + RERANKING TEST
# ---------------------------------------------------------------------------

def main() -> None:
    """
    Retrieve the top 50 using retrieval.py, then rerank to the best five.

    This standalone test proves the retrieval and reranking stages work
    before rag.py connects them to generation.py.
    """

    # Import here to avoid loading retrieval dependencies when this module
    # is imported only for reranking.
    from retrieval import (
        connect_to_weaviate,
        create_retriever,
        retrieve_top_k,
    )

    print("=" * 80)
    print("CIS CONTROLS CROSS-ENCODER RERANKER")
    print("=" * 80)
    print(f"Model:       {RERANKER_MODEL_NAME}")
    print(f"Candidates:  {EXPECTED_RETRIEVED_CANDIDATES}")
    print(f"Final top-N: {FINAL_TOP_N}")
    print()

    question = input("Enter your question: ").strip()

    if not question:
        raise ValueError("The question cannot be empty.")

    client = connect_to_weaviate()

    try:
        retriever = create_retriever(client)

        retrieved_documents, retrieval_duration = (
            retrieve_top_k(
                retriever=retriever,
                question=question,
            )
        )

        print()
        print(
            f"Retrieved {len(retrieved_documents)} candidates "
            f"in {retrieval_duration:.4f} seconds."
        )

        reranker = BGEReranker()

        reranked_documents, reranking_duration = (
            rerank_documents(
                question=question,
                documents=retrieved_documents,
                reranker=reranker,
                top_n=FINAL_TOP_N,
            )
        )

        print_reranking_results(
            question=question,
            original_count=len(retrieved_documents),
            documents=reranked_documents,
            duration=reranking_duration,
        )

        save_reranking_results(
            question=question,
            original_count=len(retrieved_documents),
            documents=reranked_documents,
            duration=reranking_duration,
        )

    finally:
        client.close()
        print("Weaviate connection closed.")


if __name__ == "__main__":
    main()