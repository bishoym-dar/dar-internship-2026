const API_BASE_URL = "http://127.0.0.1:8000";

export async function sendChatMessage(message) {
  const response = await fetch(`${API_BASE_URL}/api/chat`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
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
      // Keep the default error when the backend did not return JSON.
    }

    throw new Error(errorMessage);
  }

  return response.json();
}