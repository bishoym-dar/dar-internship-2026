const API_BASE_URL = "http://127.0.0.1:8000";

async function getErrorMessage(response, fallbackMessage) {
  try {
    const errorData = await response.json();
    return errorData.detail || fallbackMessage;
  } catch {
    return fallbackMessage;
  }
}

export async function getConversations() {
  const response = await fetch(`${API_BASE_URL}/api/conversations`);

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "The conversations could not be loaded."
      )
    );
  }

  return response.json();
}

export async function getConversation(conversationId) {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}`
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "The conversation could not be loaded."
      )
    );
  }

  return response.json();
}

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
    throw new Error(
      await getErrorMessage(
        response,
        "The conversation could not be created."
      )
    );
  }

  return response.json();
}

export async function renameConversation(
  conversationId,
  title
) {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}`,
    {
      method: "PATCH",
      headers: {
        "Content-Type": "application/json",
      },
      body: JSON.stringify({
        title,
      }),
    }
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "The conversation could not be renamed."
      )
    );
  }

  return response.json();
}

export async function deleteConversation(conversationId) {
  const response = await fetch(
    `${API_BASE_URL}/api/conversations/${conversationId}`,
    {
      method: "DELETE",
    }
  );

  if (!response.ok) {
    throw new Error(
      await getErrorMessage(
        response,
        "The conversation could not be deleted."
      )
    );
  }
}