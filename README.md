## a little bit about what we have  

this is a RAG(Retrieval-Augmented Generation) assistant chatbot that awnsers ONLY questions about the CIS controls using locally indexed doccumentation , it has multiple chats accessible via chat history with the ability to deletecertain chats from it aswell as collecting user feedback with a guided experience 


# Features

## AI & Retrieval

- Retrieval-Augmented Generation (RAG)
- Grounded responses using indexed CIS documentation
- Local LLM inference through Ollama
- Weaviate vector search
- Streaming AI responses
- Strict source citations with fixed format (`[Source X]`)
- Clickable citations with source metadata

## Conversation Management

- Persistent conversations stored in MongoDB
- Resumeable previous conversations
- Automatic conversation titles
- Renameable conversations
- Conversations can be deleted
- Sidebar conversation history
- Search conversations

## Response Features

- Streaming responses
- Copy response
- Response generation time
- Response regeneration and time it took to regenrate 
- Multiple answer versions
- Previous / Next version navigation
- Source metadata for every version

## Feedback System

- Thumbs Up / Down feedback
- Structured negative feedback reasons
- Optional written feedback(Other)
- Feedback is stored in MongoDB
- Feedback linked to specific message versions

## User Experience

- Guided product tour
- Help button to replay the tour
- Empty state with suggested questions
- Responsive interface
- Modern minimal UI



# Technology Stack

## Frontend

- React
- Vite
- Tailwind CSS
- shadcn/ui
- Lucide Icons
- React Markdown (headings, subheaddings, bulletpoints)
- Remark-gfm(RAG can reply with a table )

## Backend

- FastAPI
- Python
- Pydantic
- Uvicorn

## AI

- Ollama
- Local LLM
- Retrieval-Augmented Generation (RAG)

## Databases

- MongoDB
- Weaviate

---

# System Architecture


User
   v
   v
React Frontend
   v
Streaming API
   v
FastAPI Backend
   v
Retrieve Relevant Chunks
   v
Weaviate
   v
Build Prompt
   v
Ollama LLM
   v
Generate Grounded Response
   v
Normalize & Validate Citations
   v
Return Streamed Response
   v
MongoDB
(Store conversations,
versions and feedback)



# Project Structure


dar-internship-2026
│
├── backend
│   ├── app
│   │   ├── services
│   │   │   ├── models/
│   │   │   ├── routes/
│   │   │   ├── generation.py
│   │   │   ├── rag.py
│   │   │   ├── reranking.py
│   │   │   └── retrieval.py
│   │   │
│   │   ├── database.py
│   │   └── main.py
│   │
│   ├── requirements.txt
│   └── .env.example
│
├── frontend
│   ├── public/
│   ├── src
│   │   ├── assets/
│   │   ├── components
│   │   │   ├── chat/
│   │   │   ├── feedback/
│   │   │   ├── header/
│   │   │   ├── sidebar/
│   │   │   ├── sources/
│   │   │   └── tour/
│   │   │
│   │   ├── hooks/
│   │   ├── lib/
│   │   ├── pages/
│   │   ├── services/
│   │   ├── utils/
│   │   │
│   │   ├── App.jsx
│   │   ├── App.css
│   │   ├── index.css
│   │   └── main.jsx
│   │
│   ├── package.json
│   └── vite.config.js
│
├── README.md
├── CLAUDE.md
└── .gitignore




-----------------------------


## Prerequisites

Install the following before running the project:

- Python 3.12+
- Node.js 20+
- MongoDB
- Weaviate
- Ollama


------------------------------

## Backend Setup

Create a virtual environment:

```bash
cd backend

python -m venv .venv
```

Activate it.


===[ON WINDOWS]===

```bash
.venv\Scripts\activate
```

===[ON LINUX/macOS]===

```bash
source .venv/bin/activate
```

Install dependencies:

```bash
pip install -r requirements.txt
```

------------------------------

# Frontend Setup

```bash
cd frontend

npm install
```

------------------------------

# MongoDB

Start MongoDB locally.

The application automatically creates the required collections on first run.

---

# Weaviate

Start Weaviate.

Import the CIS document embeddings into the vector database before using the application.

---

# Ollama

Install Ollama.

Pull the required model.

Example:

```bash
ollama pull llama3
```

If using another model, update the backend configuration accordingly.

---

# Running the Application

## Backend

```bash
cd backend

.venv\Scripts\activate

python -m uvicorn app.main:app --reload
```

Backend URL

```
http://localhost:8000
```

---

## Frontend

```bash
cd frontend

npm run dev
```

Frontend URL

```
http://localhost:5173
```

------------------------------

# Happy Path

A complete demonstration of the application should follow this flow:

1. Launch the application.
2. Complete or skip the guided tour.
3. Start a new conversation.
4. Ask a question about the CIS Controls.
5. Observe the streamed response.
6. Open one of the source citations.
7. Copy the generated answer.
8. Regenerate the response.
9. Navigate between response versions.
10. Submit positive or negative feedback.
11. Refresh the page.
12. Resume the saved conversation.
13. Rename the conversation.
14. Delete a test conversation.


------------------------------

# Citation System

The assistant only answers using retrieved CIS documentation.

Every factual statement is accompanied by a source citation:

```
[Source 1]
```

Selecting a citation displays additional metadata including:

- Document
- Title
- Retrieved text
- Page information
- Additional source details such as which chunk 

------------------------------

# Feedback Pipeline

Each generated answer version has its own identifier.

Feedback is linked to:

- Conversation
- Message
- Response Version

This enables future evaluation of answer quality and retrieval performance.

------------------------------

# AI Tooling

AI-assisted development was used throughout this project to accelerate implementation and improve code quality.

AI assistance included:

- Architecture discussions
- Feature planning
- Backend API development
- React component generation
- MongoDB schema design
- RAG prompt engineering
- UI/UX improvements
- Debugging
- Documentation
- Guided tour implementation
- Code reviews
- optimization and researching models 

All generated code sections were manually reviewed, tested, and adapted before integration.





# Troubleshooting
------------------------------


## MongoDB connection issues

Ensure MongoDB is running locally.

------------------------------

## Ollama not responding

Verify the model is installed.

```bash
ollama list
```

------------------------------

## Frontend cannot reach backend

Confirm the FastAPI server is running on the configured port.

------------------------------

## Missing citations

Verify:

- Weaviate is populated
- Retrieval returns relevant chunks
- Ollama is running

------------------------------
