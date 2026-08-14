const API_BASE_URL = "http://127.0.0.1:8000";

async function getErrorMessage(
  response,
  fallbackMessage
) {
  try {
    const errorData = await response.json();

    return (
      errorData.detail ||
      errorData.message ||
      fallbackMessage
    );
  } catch {
    return fallbackMessage;
  }
}

async function consumeSseResponse(
  response,
  {
    onChunk,
    onSources,
    onDone,
  } = {}
) {
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
      .filter((line) =>
        line.startsWith("data:")
      )
      .map((line) =>
        line.slice(5).trim()
      );

    if (dataLines.length === 0) {
      return false;
    }

    const jsonText = dataLines.join("\n");

    if (!jsonText) {
      return false;
    }

    const payload = JSON.parse(jsonText);

    if (payload.type === "chunk") {
      const content =
        payload.content ?? "";

      if (content) {
        onChunk?.(content);
      }

      return false;
    }

    if (payload.type === "sources") {
      onSources?.(
        Array.isArray(payload.sources)
          ? payload.sources
          : []
      );

      return false;
    }

    if (payload.type === "error") {
      throw new Error(
        payload.message ||
          "Streaming failed."
      );
    }

    if (payload.type === "done") {
      if (Array.isArray(payload.sources)) {
        onSources?.(payload.sources);
      }

      onDone?.(payload);

      return true;
    }

    return false;
  }

  while (true) {
    const { value, done } =
      await reader.read();

    if (done) {
      const remainingEvent =
        buffer.trim();

      if (remainingEvent) {
        processEvent(remainingEvent);
      }

      break;
    }

    buffer += decoder.decode(value, {
      stream: true,
    });

    const events = buffer.split(
      /\r?\n\r?\n/
    );

    buffer = events.pop() ?? "";

    for (const event of events) {
      if (!event.trim()) {
        continue;
      }

      const streamFinished =
        processEvent(event);

      if (streamFinished) {
        await reader.cancel();
        return;
      }
    }
  }
}

export async function createConversation(
  title = "New Chat"
) {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        title,
      }),
    }
  );

  if (!response.ok) {
    const errorMessage =
      await getErrorMessage(
        response,
        "The conversation could not be created."
      );

    throw new Error(errorMessage);
  }

  return response.json();
}

export async function streamChatMessage(
  message,
  onChunk,
  conversationId,
  onSources,
  onDone
) {
  if (!conversationId) {
    throw new Error(
      "A conversation must be created before sending a message."
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/api/chat/stream`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
        Accept: "text/event-stream",
      },
      body: JSON.stringify({
        message,
        conversation_id:
          conversationId,
      }),
    }
  );

  if (!response.ok) {
    const errorMessage =
      await getErrorMessage(
        response,
        "The backend could not process the message."
      );

    throw new Error(errorMessage);
  }

  await consumeSseResponse(response, {
    onChunk,
    onSources,
    onDone,
  });
}

export async function streamRegenerateMessage(
  assistantMessageId,
  onChunk,
  onSources,
  onDone
) {
  if (!assistantMessageId) {
    throw new Error(
      "An assistant message ID is required for regeneration."
    );
  }

  const response = await fetch(
    `${API_BASE_URL}/api/messages/${encodeURIComponent(
      assistantMessageId
    )}/regenerate/stream`,
    {
      method: "POST",
      headers: {
        Accept: "text/event-stream",
      },
    }
  );

  if (!response.ok) {
    const errorMessage =
      await getErrorMessage(
        response,
        "The response could not be regenerated."
      );

    throw new Error(errorMessage);
  }

  await consumeSseResponse(response, {
    onChunk,
    onSources,
    onDone,
  });
  
}
export async function submitFeedback({
  messageId,
  versionId,
  rating,
  reason = null,
  comment = null,
}) {
  const response = await fetch(
    `${API_BASE_URL}/api/feedback`,
    {
      method: "POST",
      headers: {
        "Content-Type":
          "application/json",
      },
      body: JSON.stringify({
        message_id: messageId,
        version_id: versionId,
        rating,
        reason,
        comment,
      }),
    }
  );

  if (!response.ok) {
    const errorMessage =
      await getErrorMessage(
        response,
        "The feedback could not be saved."
      );

    throw new Error(errorMessage);
  }

  return response.json();
}