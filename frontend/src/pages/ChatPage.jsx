// The main page where the user chats with the assistant.

import { useState } from "react";

import ChatInput from "@/components/chat/ChatInput";
import ChatWindow from "@/components/chat/ChatWindow";
import Header from "@/components/layout/Header";
import { streamChatMessage } from "@/services/chatApi";

function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  async function handleSendMessage(messageText) {
    const trimmedMessage = messageText.trim();

    if (!trimmedMessage || isLoading) {
      return;
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedMessage,
    };

    // Record when the user sends the question.
    const requestStartedAt = performance.now();

    // Add only the user message initially.
    // The assistant message is created when the first chunk arrives.
    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ]);

    setIsLoading(true);
    setIsThinking(true);

    let assistantId = null;

    try {
      await streamChatMessage(trimmedMessage, (chunk) => {
        if (!chunk) {
          return;
        }

        setMessages((currentMessages) => {
          // First chunk: create the assistant message and record
          // how long it took to begin responding.
          if (assistantId === null) {
            assistantId = crypto.randomUUID();

            const respondedInSeconds =
              (performance.now() - requestStartedAt) / 1000;

            return [
              ...currentMessages,
              {
                id: assistantId,
                role: "assistant",
                content: chunk,
                respondedInSeconds,
              },
            ];
          }

          // Later chunks: append them to the same assistant message.
          return currentMessages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: message.content + chunk,
                }
              : message
          );
        });

        // Remove the thinking indicator when the first text arrives.
        setIsThinking(false);
      });
    } catch (error) {
      setIsThinking(false);

      const errorText =
        error instanceof Error
          ? `Connection error: ${error.message}`
          : "Connection error: The backend could not be reached.";

      if (assistantId === null) {
        // The request failed before any answer text arrived.
        setMessages((currentMessages) => [
          ...currentMessages,
          {
            id: crypto.randomUUID(),
            role: "assistant",
            content: errorText,
            isError: true,
          },
        ]);
      } else {
        // The stream failed after some text had already arrived.
        setMessages((currentMessages) =>
          currentMessages.map((message) =>
            message.id === assistantId
              ? {
                  ...message,
                  content: errorText,
                  isError: true,
                }
              : message
          )
        );
      }
    } finally {
      setIsLoading(false);
      setIsThinking(false);
    }
  }

  return (
    <div className="flex h-screen flex-col bg-[#EADADA] text-[#4D3A4D]">
      <Header />

      <ChatWindow
        messages={messages}
        isLoading={isLoading}
        isThinking={isThinking}
      />

      <ChatInput
        onSendMessage={handleSendMessage}
        isLoading={isLoading}
      />
    </div>
  );
}

export default ChatPage;