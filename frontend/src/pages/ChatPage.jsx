import {
  useEffect,
  useState,
} from "react";

import ChatInput from "@/components/chat/ChatInput";
import ChatWindow from "@/components/chat/ChatWindow";
import Header from "@/components/layout/Header";
import Sidebar from "@/components/sidebar/Sidebar";
import GuidedTour from "@/components/tour/GuidedTour";

import {
  streamChatMessage,
  streamRegenerateMessage,
  submitFeedback,
} from "@/services/chatApi";

import {
  createConversation,
  deleteConversation,
  getConversation,
  getConversations,
  renameConversation,
} from "@/services/conversationApi";

const ACTIVE_CONVERSATION_KEY =
  "activeConversationId";
const TOUR_STORAGE_KEY =
  "ragAssistantTourCompleted";

// Set this to true while testing the tour.
// Change it back to false before the final demo.
const ALWAYS_SHOW_TOUR = false;
function createConversationTitle(
  messageText
) {
  const cleanTitle = messageText
    .trim()
    .replace(/\s+/g, " ");

  if (cleanTitle.length <= 60) {
    return cleanTitle;
  }

  return `${cleanTitle.slice(
    0,
    57
  )}...`;
}

function normalizeVersion(
  version,
  fallbackVersionNumber = 1
) {
  if (!version) {
    return null;
  }

  return {
    versionId:
      version.version_id ??
      version.versionId ??
      crypto.randomUUID(),

    versionNumber:
      version.version_number ??
      version.versionNumber ??
      fallbackVersionNumber,

    content:
      version.content ?? "",

    sources: Array.isArray(
      version.sources
    )
      ? version.sources
      : [],

    respondedInSeconds:
      version.responded_in_seconds ??
      version.respondedInSeconds ??
      undefined,

    createdAt:
      version.created_at ??
      version.createdAt ??
      null,

    feedback:
      version.feedback ?? null,
  };
}

function normalizeVersions(
  versions = []
) {
  if (!Array.isArray(versions)) {
    return [];
  }

  return versions
    .map((version, index) =>
      normalizeVersion(
        version,
        index + 1
      )
    )
    .filter(Boolean);
}

function convertDatabaseMessage(
  message
) {
  let versions = normalizeVersions(
    message.versions
  );

  if (
    message.role === "assistant" &&
    versions.length === 0 &&
    message.content
  ) {
    versions = [
      normalizeVersion(
        {
          content: message.content,
          sources:
            message.sources ?? [],
          responded_in_seconds:
            message.responded_in_seconds,
          created_at:
            message.created_at,
        },
        1
      ),
    ];
  }

  const requestedActiveVersion =
    Number(
      message.active_version ?? 0
    );

  const activeVersion =
    versions.length > 0
      ? Math.min(
          Math.max(
            requestedActiveVersion,
            0
          ),
          versions.length - 1
        )
      : 0;

  const selectedVersion =
    versions[activeVersion];

  return {
    id: message.id,
    role: message.role,

    content:
      selectedVersion?.content ??
      message.content ??
      "",

    respondedInSeconds:
      selectedVersion
        ?.respondedInSeconds ??
      message.responded_in_seconds ??
      undefined,

    isError:
      message.is_error ?? false,

    sources:
      selectedVersion?.sources ??
      message.sources ??
      [],

    versions,
    activeVersion,
    isRegenerating: false,
  };
}

function ChatPage() {
  const [
    messages,
    setMessages,
  ] = useState([]);

  const [
    conversations,
    setConversations,
  ] = useState([]);

  const [
    conversationId,
    setConversationId,
  ] = useState(() =>
    localStorage.getItem(
      ACTIVE_CONVERSATION_KEY
    )
  );

  const [
    streamingMessageId,
    setStreamingMessageId,
  ] = useState(null);

  const [
    isSidebarOpen,
    setIsSidebarOpen,
  ] = useState(true);

  const [
  isTourOpen,
  setIsTourOpen,
] = useState(false);

  const [
    isLoading,
    setIsLoading,
  ] = useState(false);

  const [
    isThinking,
    setIsThinking,
  ] = useState(false);

  const [
    isLoadingConversations,
    setIsLoadingConversations,
  ] = useState(true);

  const [
    isLoadingSelectedConversation,
    setIsLoadingSelectedConversation,
  ] = useState(false);
useEffect(() => {
  const hasCompletedTour =
    localStorage.getItem(
      TOUR_STORAGE_KEY
    ) === "true";

  if (
    ALWAYS_SHOW_TOUR ||
    !hasCompletedTour
  ) {
    const timeoutId =
      window.setTimeout(() => {
        setIsSidebarOpen(true);
        setIsTourOpen(true);
      }, 500);

    return () => {
      window.clearTimeout(timeoutId);
    };
  }

  return undefined;
}, []);
  async function refreshConversationList() {
    const loadedConversations =
      await getConversations();

    setConversations(
      loadedConversations
    );

    return loadedConversations;
  }

  async function loadConversation(
    selectedId
  ) {
    if (!selectedId) {
      return;
    }

    setIsLoadingSelectedConversation(
      true
    );

    setStreamingMessageId(null);

    try {
      const conversation =
        await getConversation(
          selectedId
        );

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
      setIsLoadingSelectedConversation(
        false
      );
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
        setIsLoadingConversations(
          false
        );
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
        createConversationTitle(
          firstMessage
        )
      );

    const newConversationId =
      conversation.id;

    if (!newConversationId) {
      throw new Error(
        "The backend created a conversation without returning its ID."
      );
    }

    setConversationId(
      newConversationId
    );

    localStorage.setItem(
      ACTIVE_CONVERSATION_KEY,
      newConversationId
    );

    setConversations(
      (currentConversations) => [
        conversation,
        ...currentConversations.filter(
          (item) =>
            item.id !==
            newConversationId
        ),
      ]
    );

    return newConversationId;
  }

function handleStartTour() {
  setIsSidebarOpen(true);
  setIsTourOpen(true);
}

function handleCloseTour({
  completed = false,
} = {}) {
  if (completed) {
    localStorage.setItem(
      TOUR_STORAGE_KEY,
      "true"
    );
  }

  setIsTourOpen(false);
}

  function handleNewChat() {
    if (isLoading) {
      return;
    }

    setConversationId(null);
    setMessages([]);
    setIsThinking(false);
    setStreamingMessageId(null);

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

    await loadConversation(
      selectedId
    );

    if (
      window.innerWidth < 768
    ) {
      setIsSidebarOpen(false);
    }
  }
async function handleRenameConversation(
  conversation
) {
  if (
    !conversation?.id ||
    isLoading
  ) {
    return;
  }

  const currentTitle =
    conversation.title ||
    "Untitled Chat";

  const requestedTitle =
    window.prompt(
      "Rename conversation",
      currentTitle
    );

  if (requestedTitle === null) {
    return;
  }

  const cleanTitle =
    requestedTitle.trim();

  if (!cleanTitle) {
    window.alert(
      "The conversation title cannot be empty."
    );

    return;
  }

  if (cleanTitle === currentTitle) {
    return;
  }

  try {
    const updatedConversation =
      await renameConversation(
        conversation.id,
        cleanTitle
      );

    setConversations(
      (currentConversations) =>
        currentConversations.map(
          (item) =>
            item.id ===
            conversation.id
              ? {
                  ...item,
                  ...updatedConversation,
                  title: cleanTitle,
                }
              : item
        )
    );
  } catch (error) {
    console.error(
      "Could not rename conversation:",
      error
    );

    window.alert(
      error instanceof Error
        ? error.message
        : "The conversation could not be renamed."
    );
  }
}

async function handleDeleteConversation(
  conversation
) {
  if (
    !conversation?.id ||
    isLoading
  ) {
    return;
  }

  const title =
    conversation.title ||
    "Untitled Chat";

  const shouldDelete =
    window.confirm(
      `Delete "${title}"?\n\n` +
        "This will permanently delete the conversation, its messages, and related feedback."
    );

  if (!shouldDelete) {
    return;
  }

  try {
    await deleteConversation(
      conversation.id
    );

    setConversations(
      (currentConversations) =>
        currentConversations.filter(
          (item) =>
            item.id !==
            conversation.id
        )
    );

    if (
      conversation.id ===
      conversationId
    ) {
      setConversationId(null);
      setMessages([]);
      setIsThinking(false);
      setStreamingMessageId(null);

      localStorage.removeItem(
        ACTIVE_CONVERSATION_KEY
      );
    }
  } catch (error) {
    console.error(
      "Could not delete conversation:",
      error
    );

    window.alert(
      error instanceof Error
        ? error.message
        : "The conversation could not be deleted."
    );
  }
}
  async function handleSendMessage(
    messageText
  ) {
    const trimmedMessage =
      messageText.trim();

    if (
      !trimmedMessage ||
      isLoading
    ) {
      return;
    }

    const userMessage = {
      id: crypto.randomUUID(),
      role: "user",
      content: trimmedMessage,
    };

    const requestStartedAt =
      performance.now();

    setMessages(
      (currentMessages) => [
        ...currentMessages,
        userMessage,
      ]
    );

    setIsLoading(true);
    setIsThinking(true);
    setStreamingMessageId(null);

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
            return;
          }

          setMessages(
            (currentMessages) => {
              if (
                assistantId === null
              ) {
                assistantId =
                  crypto.randomUUID();

                setStreamingMessageId(
                  assistantId
                );

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
                    sources: [],
                    versions: [],
                    activeVersion: 0,
                    isRegenerating:
                      false,
                  },
                ];
              }

              return currentMessages.map(
                (message) =>
                  message.id ===
                  assistantId
                    ? {
                        ...message,
                        content:
                          message.content +
                          chunk,
                      }
                    : message
              );
            }
          );

          setIsThinking(false);
        },

        activeConversationId,

        (sources) => {
          if (
            assistantId === null ||
            !Array.isArray(sources)
          ) {
            return;
          }

          setMessages(
            (currentMessages) =>
              currentMessages.map(
                (message) =>
                  message.id ===
                  assistantId
                    ? {
                        ...message,
                        sources,
                      }
                    : message
              )
          );
        },

        (payload) => {
          if (
            assistantId === null ||
            !payload
              ?.assistant_message_id
          ) {
            return;
          }

          const temporaryId =
            assistantId;

          const savedMessageId =
            payload
              .assistant_message_id;

          const firstVersion =
            normalizeVersion(
              payload.version,
              1
            );

          const versions =
            firstVersion
              ? [firstVersion]
              : [];

          setMessages(
            (currentMessages) =>
              currentMessages.map(
                (message) => {
                  if (
                    message.id !==
                    temporaryId
                  ) {
                    return message;
                  }

                  const selectedVersion =
                    versions[0];

                  return {
                    ...message,
                    id: savedMessageId,

                    content:
                      selectedVersion
                        ?.content ??
                      message.content,

                    sources:
                      selectedVersion
                        ?.sources ??
                      payload.sources ??
                      message.sources,

                    respondedInSeconds:
                      selectedVersion
                        ?.respondedInSeconds ??
                      payload
                        .responded_in_seconds ??
                      message
                        .respondedInSeconds,

                    versions,
                    activeVersion: 0,
                  };
                }
              )
          );

          setStreamingMessageId(
            (currentId) =>
              currentId ===
              temporaryId
                ? savedMessageId
                : currentId
          );

          assistantId =
            savedMessageId;
        }
      );

      await refreshConversationList();
    } catch (error) {
      setIsThinking(false);

      const errorText =
        error instanceof Error
          ? `Connection error: ${error.message}`
          : "Connection error: The backend could not be reached.";

      if (assistantId === null) {
        setMessages(
          (currentMessages) => [
            ...currentMessages,
            {
              id: crypto.randomUUID(),
              role: "assistant",
              content: errorText,
              isError: true,
              sources: [],
              versions: [],
              activeVersion: 0,
            },
          ]
        );
      } else {
        setMessages(
          (currentMessages) =>
            currentMessages.map(
              (message) =>
                message.id ===
                assistantId
                  ? {
                      ...message,
                      content:
                        errorText,
                      isError: true,
                    }
                  : message
            )
        );
      }
    } finally {
      setIsLoading(false);
      setIsThinking(false);
      setStreamingMessageId(null);
    }
  }

  async function handleRegenerate(
    assistantMessageId
  ) {
    if (
      !assistantMessageId ||
      isLoading
    ) {
      return;
    }

    const originalMessage =
      messages.find(
        (message) =>
          message.id ===
          assistantMessageId
      );

    if (
      !originalMessage ||
      originalMessage.role !==
        "assistant" ||
      originalMessage.isError
    ) {
      return;
    }

    const previousSnapshot = {
      content:
        originalMessage.content,

      sources:
        originalMessage.sources,

      respondedInSeconds:
        originalMessage
          .respondedInSeconds,

      versions:
        originalMessage.versions,

      activeVersion:
        originalMessage.activeVersion,
    };

    setIsLoading(true);
    setIsThinking(false);

    setStreamingMessageId(
      assistantMessageId
    );

    setMessages(
      (currentMessages) =>
        currentMessages.map(
          (message) =>
            message.id ===
            assistantMessageId
              ? {
                  ...message,
                  content: "",
                  sources: [],
                  respondedInSeconds:
                    undefined,
                  isRegenerating: true,
                }
              : message
        )
    );

    try {
      await streamRegenerateMessage(
        assistantMessageId,

        (chunk) => {
          setMessages(
            (currentMessages) =>
              currentMessages.map(
                (message) =>
                  message.id ===
                  assistantMessageId
                    ? {
                        ...message,
                        content:
                          message.content +
                          chunk,
                      }
                    : message
              )
          );
        },

        (sources) => {
          setMessages(
            (currentMessages) =>
              currentMessages.map(
                (message) =>
                  message.id ===
                  assistantMessageId
                    ? {
                        ...message,
                        sources:
                          Array.isArray(
                            sources
                          )
                            ? sources
                            : [],
                      }
                    : message
              )
          );
        },

        (payload) => {
          const normalizedVersions =
            normalizeVersions(
              payload.versions ??
                (
                  payload.version
                    ? [
                        payload.version,
                      ]
                    : []
                )
            );

          const requestedIndex =
            Number(
              payload.active_version ??
                normalizedVersions.length -
                  1
            );

          const activeVersion =
            normalizedVersions.length >
            0
              ? Math.min(
                  Math.max(
                    requestedIndex,
                    0
                  ),
                  normalizedVersions.length -
                    1
                )
              : 0;

          const selectedVersion =
            normalizedVersions[
              activeVersion
            ];

          setMessages(
            (currentMessages) =>
              currentMessages.map(
                (message) =>
                  message.id ===
                  assistantMessageId
                    ? {
                        ...message,

                        content:
                          selectedVersion
                            ?.content ??
                          message.content,

                        sources:
                          selectedVersion
                            ?.sources ??
                          payload.sources ??
                          message.sources,

                        respondedInSeconds:
                          selectedVersion
                            ?.respondedInSeconds ??
                          payload
                            .responded_in_seconds,

                        versions:
                          normalizedVersions,

                        activeVersion,

                        isRegenerating:
                          false,
                      }
                    : message
              )
          );
        }
      );

      await refreshConversationList();
    } catch (error) {
      console.error(
        "Could not regenerate response:",
        error
      );

      setMessages(
        (currentMessages) =>
          currentMessages.map(
            (message) =>
              message.id ===
              assistantMessageId
                ? {
                    ...message,
                    ...previousSnapshot,
                    isRegenerating:
                      false,
                  }
                : message
          )
      );

      window.alert(
        error instanceof Error
          ? error.message
          : "The response could not be regenerated."
      );
    } finally {
      setIsLoading(false);
      setStreamingMessageId(null);
    }
  }

  async function handleSubmitFeedback({
    messageId,
    versionId,
    rating,
    reason = null,
    comment = null,
  }) {
    if (
      !messageId ||
      !versionId ||
      !["up", "down"].includes(rating)
    ) {
      throw new Error(
        "Valid message, version, and rating values are required."
      );
    }

    const result = await submitFeedback({
      messageId,
      versionId,
      rating,
      reason,
      comment,
    });

    setMessages((currentMessages) =>
      currentMessages.map((message) => {
        if (message.id !== messageId) {
          return message;
        }

        const updatedVersions = (
          message.versions ?? []
        ).map((version) =>
          version.versionId === versionId
            ? {
                ...version,
                feedback: {
                  rating,
                  reason,
                  comment,
                },
              }
            : version
        );

        return {
          ...message,
          versions: updatedVersions,
        };
      })
    );

    return result;
  }

  function handleSelectVersion(
    assistantMessageId,
    versionIndex
  ) {
    if (isLoading) {
      return;
    }

    setMessages(
      (currentMessages) =>
        currentMessages.map(
          (message) => {
            if (
              message.id !==
              assistantMessageId ||
              message.role !==
                "assistant"
            ) {
              return message;
            }

            const versions =
              message.versions ?? [];

            if (
              versionIndex < 0 ||
              versionIndex >=
                versions.length
            ) {
              return message;
            }

            const selectedVersion =
              versions[
                versionIndex
              ];

            return {
              ...message,

              activeVersion:
                versionIndex,

              content:
                selectedVersion
                  .content,

              sources:
                selectedVersion
                  .sources ?? [],

              respondedInSeconds:
                selectedVersion
                  .respondedInSeconds,
            };
          }
        )
    );
  }

  return (
    <div className="flex h-screen overflow-hidden bg-[#EADADA] text-[#4D3A4D]">
      <Sidebar
  isOpen={isSidebarOpen}
  conversations={conversations}
  activeConversationId={
    conversationId
  }
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
  onRenameConversation={
    handleRenameConversation
  }
  onDeleteConversation={
    handleDeleteConversation
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
  onStartTour={
    handleStartTour
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
            isThinking={isThinking}
            streamingMessageId={
              streamingMessageId
            }
            isChatBusy={isLoading}
            onSuggestedQuestion={
              handleSendMessage
            }
            onRegenerate={
              handleRegenerate
            }
            onSelectVersion={
              handleSelectVersion
            }
            onSubmitFeedback={
              handleSubmitFeedback
            }
          />
        )}

        <ChatInput
          onSendMessage={
            handleSendMessage
          }
          isLoading={
            isLoading ||
            isLoadingSelectedConversation
          }
        />
            </main>

      <GuidedTour
        isOpen={isTourOpen}
        onClose={
          handleCloseTour
        }
        onEnsureSidebarOpen={() =>
          setIsSidebarOpen(true)
        }
      />
    </div>
  );
    
  
}

export default ChatPage;