const API_BASE_URL = "http://127.0.0.1:8000";

export async function streamChatMessage(message, onChunk) {
  const response = await fetch(`${API_BASE_URL}/api/chat/stream`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Accept: "text/event-stream",
    },
    body: JSON.stringify({
      message,
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
    throw new Error("The browser does not support streaming.");
  }

  const reader = response.body.getReader();
  const decoder = new TextDecoder("utf-8");

  let buffer = "";

  while (true) {
    const { value, done } = await reader.read();

    if (done) {
      break;
    }

    buffer += decoder.decode(value, { stream: true });

    const events = buffer.split("\n\n");
    buffer = events.pop() ?? "";

    for (const event of events) {
      const dataLine = event
        .split("\n")
        .find((line) => line.startsWith("data:"));

      if (!dataLine) {
        continue;
      }

      const jsonText = dataLine.replace("data:", "").trim();

      if (!jsonText) {
        continue;
      }

      const payload = JSON.parse(jsonText);

      if (payload.type === "chunk") {
        onChunk(payload.content ?? "");
      }

      if (payload.type === "error") {
        throw new Error(payload.message ?? "Streaming failed.");
      }

      if (payload.type === "done") {
        return;
      }
    }
  }
}