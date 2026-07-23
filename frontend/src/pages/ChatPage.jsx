import { useEffect, useState } from "react";

import ChatInput from "@/components/chat/ChatInput";
import ChatWindow from "@/components/chat/ChatWindow";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/sidebar/Sidebar";

import { streamChatMessage } from "@/services/chatApi";

import {
  createConversation,
  getConversation,
  getConversations,
} from "@/services/conversationApi";

const ACTIVE_CONVERSATION_KEY = "activeConversationId";

function createConversationTitle(messageText) {
  const cleanTitle = messageText
    .trim()
    .replace(/\s+/g, " ");

  if (cleanTitle.length <= 60) {
    return cleanTitle;
  }

  return `${cleanTitle.slice(0, 57)}...`;
}

function convertDatabaseMessage(message) {
  return {
    id: message.id,
    role: message.role,
    content: message.content,
    respondedInSeconds:
      message.responded_in_seconds ?? undefined,
    isError: message.is_error ?? false,
    sources: message.sources ?? [],
    versions: message.versions ?? [],
    activeVersion: message.active_version ?? 0,
  };
}

function ChatPage() {
  const [messages, setMessages] = useState([]);
  const [conversations, setConversations] = useState([]);

  const [conversationId, setConversationId] =
    useState(() =>
      localStorage.getItem(ACTIVE_CONVERSATION_KEY)
    );

  const [isSidebarOpen, setIsSidebarOpen] =
    useState(true);

  const [isLoading, setIsLoading] = useState(false);
  const [isThinking, setIsThinking] = useState(false);

  const [
    isLoadingConversations,
    setIsLoadingConversations,
  ] = useState(true);

  const [
    isLoadingSelectedConversation,
    setIsLoadingSelectedConversation,
  ] = useState(false);

  async function refreshConversationList() {
    const loadedConversations = await getConversations();
    setConversations(loadedConversations);
    return loadedConversations;
  }

  async function loadConversation(selectedId) {
    if (!selectedId) {
      return;
    }

    setIsLoadingSelectedConversation(true);

    try {
      const conversation =
        await getConversation(selectedId);

      const loadedMessages = (
        conversation.messages ?? []
      ).map(convertDatabaseMessage);

      setMessages(loadedMessages);
      setConversationId(selectedId);

      localStorage.setItem(
        ACTIVE_CONVERSATION_KEY,
        selectedId
      );
    } catch (error) {
      console.error(
        "Could not load conversation:",
        error
      );

      localStorage.removeItem(
        ACTIVE_CONVERSATION_KEY
      );

      setConversationId(null);
      setMessages([]);
    } finally {
      setIsLoadingSelectedConversation(false);
    }
  }

  useEffect(() => {
    async function initializeConversations() {
      try {
        const loadedConversations =
          await refreshConversationList();

        const storedConversationId =
          localStorage.getItem(
            ACTIVE_CONVERSATION_KEY
          );

        const storedConversationExists =
          loadedConversations.some(
            (conversation) =>
              conversation.id ===
              storedConversationId
          );

        if (
          storedConversationId &&
          storedConversationExists
        ) {
          await loadConversation(
            storedConversationId
          );
        } else {
          localStorage.removeItem(
            ACTIVE_CONVERSATION_KEY
          );

          setConversationId(null);
          setMessages([]);
        }
      } catch (error) {
        console.error(
          "Could not initialize conversations:",
          error
        );
      } finally {
        setIsLoadingConversations(false);
      }
    }

    initializeConversations();
  }, []);

  async function getActiveConversationId(
    firstMessage
  ) {
    if (conversationId) {
      return conversationId;
    }

    const conversation =
      await createConversation(
        createConversationTitle(firstMessage)
      );

    const newConversationId = conversation.id;

    if (!newConversationId) {
      throw new Error(
        "The backend created a conversation without returning its ID."
      );
    }

    setConversationId(newConversationId);

    localStorage.setItem(
      ACTIVE_CONVERSATION_KEY,
      newConversationId
    );

    setConversations((currentConversations) => [
      conversation,
      ...currentConversations.filter(
        (item) => item.id !== newConversationId
      ),
    ]);

    return newConversationId;
  }

  function handleNewChat() {
    if (isLoading) {
      return;
    }

    setConversationId(null);
    setMessages([]);
    setIsThinking(false);

    localStorage.removeItem(
      ACTIVE_CONVERSATION_KEY
    );
  }

  async function handleSelectConversation(
    selectedId
  ) {
    if (
      isLoading ||
      selectedId === conversationId
    ) {
      return;
    }

    await loadConversation(selectedId);

    if (window.innerWidth < 768) {
      setIsSidebarOpen(false);
    }
  }

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

    const requestStartedAt = performance.now();

    setMessages((currentMessages) => [
      ...currentMessages,
      userMessage,
    ]);

    setIsLoading(true);
    setIsThinking(true);

    let assistantId = null;

    try {
      const activeConversationId =
        await getActiveConversationId(
          trimmedMessage
        );

      await streamChatMessage(
        trimmedMessage,
        (chunk) => {
          if (!chunk) {
            console.log("Received frontend chunk:", chunk);
            return;
          }

          setMessages((currentMessages) => {
            if (assistantId === null) {
              assistantId =
                crypto.randomUUID();

              const respondedInSeconds =
                (
                  performance.now() -
                  requestStartedAt
                ) / 1000;

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

            return currentMessages.map(
              (message) =>
                message.id === assistantId
                  ? {
                      ...message,
                      content:
                        message.content + chunk,
                    }
                  : message
            );
          });

          setIsThinking(false);
        },
        activeConversationId
      );

      await refreshConversationList();
    } catch (error) {
      setIsThinking(false);

      const errorText =
        error instanceof Error
          ? `Connection error: ${error.message}`
          : "Connection error: The backend could not be reached.";

      if (assistantId === null) {
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
    <div className="flex h-screen overflow-hidden bg-[#EADADA] text-[#4D3A4D]">
      <Sidebar
        isOpen={isSidebarOpen}
        conversations={conversations}
        activeConversationId={conversationId}
        isLoadingConversations={
          isLoadingConversations
        }
        isChatBusy={
          isLoading ||
          isLoadingSelectedConversation
        }
        onClose={() =>
          setIsSidebarOpen(false)
        }
        onNewChat={handleNewChat}
        onSelectConversation={
          handleSelectConversation
        }
      />

      <main className="flex min-w-0 flex-1 flex-col">
        <Header
          onToggleSidebar={() =>
            setIsSidebarOpen(
              (currentValue) =>
                !currentValue
            )
          }
        />

        {isLoadingSelectedConversation ? (
          <div className="flex flex-1 items-center justify-center">
            <div className="flex items-center gap-3 text-sm text-[#4D3A4D]/70">
              <span className="size-3 animate-spin rounded-full border-2 border-[#BE5CA9] border-t-transparent" />
              Loading conversation...
            </div>
          </div>
        ) : (
          <ChatWindow
            messages={messages}
            isLoading={isLoading}
            isThinking={isThinking}
          />
        )}

        <ChatInput
          onSendMessage={handleSendMessage}
          isLoading={
            isLoading ||
            isLoadingSelectedConversation
          }
        />
      </main>
    </div>
  );
}

export default ChatPage;