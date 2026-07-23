const API_BASE_URL = "http://127.0.0.1:8000";

export async function createConversation(title = "New Chat") {
  const response = await fetch(`${API_BASE_URL}/api/conversations`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
    },
    body: JSON.stringify({
      title,
    }),
  });

  if (!response.ok) {
    let errorMessage = "The conversation could not be created.";

    try {
      const errorData = await response.json();

      if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch {
      // Keep the default error message.
    }

    throw new Error(errorMessage);
  }

  return response.json();
}

export async function streamChatMessage(
  message,
  onChunk,
  conversationId
) {
  if (!conversationId) {
    throw new Error(
      "A conversation must be created before sending a message."
    );
  }

  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message,
      conversation_id: conversationId,
    }),
  });

  if (!response.ok) {
    let errorMessage = "The backend could not process the message.";

    try {
      const errorData = await response.json();

      if (errorData.detail) {
        errorMessage = errorData.detail;
      }
    } catch {
      // Keep the default error message.
    }

    throw new Error(errorMessage);
  }

  if (!response.body) {
    throw new Error(
      "The browser did not provide a readable response stream."
    );
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";

  function processEvent(eventText) {
    const lines = eventText.split(/\r?\n/);

    const dataLines = lines
      .filter((line) => line.startsWith("data:"))
      .map((line) => line.slice(5).trim());

    if (dataLines.length === 0) {
      return false;
    }

    const jsonText = dataLines.join("\n");

    if (!jsonText) {
      return false;
    }

    const payload = JSON.parse(jsonText);

    if (payload.type === "chunk") {
      const content = payload.content ?? "";

      if (content) {
        onChunk(content);
      }

      return false;
    }

    if (payload.type === "error") {
      throw new Error(
        payload.message || "Streaming failed."
      );
    }

    return payload.type === "done";
  }

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      const remainingEvent = buffer.trim();

      if (remainingEvent) {
        processEvent(remainingEvent);
      }

      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const events = buffer.split(/\r?\n\r?\n/);

    buffer = events.pop() ?? "";

    for (const event of events) {
      if (!event.trim()) {
        continue;
      }

      const streamFinished = processEvent(event);

      if (streamFinished) {
        await reader.cancel();
        return;
      }
    }
  }
}