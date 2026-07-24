# CLAUDE.md

# AI Development Instructions

This document provides guidance for AI assistants contributing to this repository.

-----------------------------

# Project Overview

This project is a RAG (Retrieval-Augmented Generation) assistant that answers questions about the CIS Controls using locally indexed documentation.

The application consists of:

- React + Vite frontend
- FastAPI backend
- Weaviate vector database
- MongoDB
- Ollama local LLM

-----------------------------

# Primary Objectives

The assistant must:

- Answer only from retrieved documentation.
- Never fabricate cybersecurity information.
- Produce grounded answers with citations.
- Maintain a clean and modern user experience.

-----------------------------

# Repository Structure

Backend responsibilities:

- Retrieval
- Prompt generation
- RAG orchestration
- Streaming
- MongoDB persistence
- Feedback pipeline

Frontend responsibilities:

- Chat interface
- Conversation history
- Streaming UI
- Citation rendering
- Guided tour
- Feedback dialogs

-----------------------------

# Important File Responsibilities

Backend:

- `generation.py` — prompt construction, response generation, citation normalization
- `rag.py` — RAG orchestration
- `retrieval.py` — document retrieval
- `reranking.py` — result reranking
- `main.py` — FastAPI application
- `database.py` — MongoDB and Weaviate connections

Frontend:

- `ChatPage.jsx` — main chat page
- `MessageBubble.jsx` — AI response rendering
- `Sidebar.jsx` — conversation management
- `GuidedTour.jsx` — onboarding experience

When modifying the project, preserve the separation of responsibilities between these files.

-----------------------------
# Coding Standards

General:

- Prefer readable code over clever code.
- Keep functions focused on one responsibility.
- Avoid duplicated logic.
- Use descriptive variable names.
- Keep components modular.

Python:

- Follow PEP 8.
- Use type hints where appropriate.
- Prefer small helper functions.

React:

- Use functional components.
- Prefer hooks.
- Keep state localized.
- Avoid unnecessary rerenders.

-----------------------------

# RAG Rules

The assistant must:

- Answer only using retrieved context.
- Never use external knowledge.
- Never fabricate answers.
- Return the insufficient-context message when appropriate.

-----------------------------

# Citation Rules

The only valid citation format is:

[Source X]

Examples:

[Source 1]

[Source 2]

Requirements:

- Every factual statement must include a citation.
- Never output page numbers.
- Never output chunk IDs.
- Never output document titles.
- Never use parentheses around citations.

Invalid examples:

(Source 1)

[Source 1 | Chunk 65]

(Source 1: page 20)

-----------------------------

# Response Formatting

When appropriate:

- Use Markdown.
- Use headings.
- Use bullet lists.
- Use numbered lists only for procedures.
- Use tables for comparisons.
- Keep paragraphs short.

-----------------------------

# Conversation Features

The application supports:

- Persistent conversations
- Conversation titles
- Rename conversations
- Delete conversations
- Conversation history

Do not break conversation persistence.

-----------------------------

# Response Features

The assistant supports:

- Streaming
- Regeneration
- Multiple versions
- Version navigation

Each regenerated answer belongs to the same assistant message.

-----------------------------

# Feedback Pipeline

Feedback is attached to:

Conversation
→ Message
→ Version

Do not separate feedback from the corresponding version.

-----------------------------

# UI Principles

The interface should remain:

- Clean
- Minimal
- Responsive
- Consistent

Avoid unnecessary visual clutter.

-----------------------------

# Guided Tour

The guided tour must:

- Highlight controls correctly.
- Support replay from the Help button.
- Never interfere with normal application usage.

-----------------------------

# Testing Checklist

Before committing:

- Verify streaming works.
- Verify citations are clickable.
- Verify regeneration works.
- Verify feedback is saved.
- Verify conversations persist.
- Verify the guided tour launches correctly.

-----------------------------

# Future Contributions

New features should preserve:

- Grounded retrieval
- Citation correctness
- Conversation persistence
- Version history
- Feedback integrity