import { useEffect, useRef, useState } from "react";

import {
  MessageSquarePlus,
  SearchX,
} from "lucide-react";

import ChatHistoryItem from "@/components/sidebar/ChatHistoryItem";

function ChatHistory({
  conversations,
  activeConversationId,
  isLoading,
  isDisabled,
  hasSearchQuery,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
}) {
  const [
    openMenuConversationId,
    setOpenMenuConversationId,
  ] = useState(null);

  const historyRef = useRef(null);

  useEffect(() => {
    function handleDocumentClick(event) {
      if (
        historyRef.current &&
        !historyRef.current.contains(
          event.target
        )
      ) {
        setOpenMenuConversationId(null);
      }
    }

    document.addEventListener(
      "mousedown",
      handleDocumentClick
    );

    return () => {
      document.removeEventListener(
        "mousedown",
        handleDocumentClick
      );
    };
  }, []);

  function handleToggleMenu(
    conversationId
  ) {
    setOpenMenuConversationId(
      (currentId) =>
        currentId === conversationId
          ? null
          : conversationId
    );
  }

  function handleRename(conversation) {
    setOpenMenuConversationId(null);
    onRenameConversation?.(conversation);
  }

  function handleDelete(conversation) {
    setOpenMenuConversationId(null);
    onDeleteConversation?.(conversation);
  }

  if (isLoading) {
    return (
      <div className="space-y-2 px-2">
        <div className="h-14 animate-pulse rounded-xl bg-[#4D3A4D]/10" />
        <div className="h-14 animate-pulse rounded-xl bg-[#4D3A4D]/10" />
        <div className="h-14 animate-pulse rounded-xl bg-[#4D3A4D]/10" />
      </div>
    );
  }

  if (conversations.length === 0) {
    if (hasSearchQuery) {
      return (
        <div className="flex flex-col items-center px-4 py-8 text-center">
          <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#BE5CA9]/10 text-[#BE5CA9]">
            <SearchX className="size-5" />
          </div>

          <p className="text-sm font-medium text-[#4D3A4D]">
            No matching chats
          </p>

          <p className="mt-1 text-xs leading-relaxed text-[#4D3A4D]/55">
            Try searching with a different
            word from the conversation title.
          </p>
        </div>
      );
    }

    return (
      <div className="flex flex-col items-center px-4 py-8 text-center">
        <div className="mb-3 flex size-10 items-center justify-center rounded-xl bg-[#BE5CA9]/10 text-[#BE5CA9]">
          <MessageSquarePlus className="size-5" />
        </div>

        <p className="text-sm font-medium text-[#4D3A4D]">
          No saved chats yet
        </p>

        <p className="mt-1 text-xs leading-relaxed text-[#4D3A4D]/55">
          Start a new conversation and it
          will appear here automatically.
        </p>
      </div>
    );
  }

  return (
    <div
      ref={historyRef}
      className="space-y-1"
    >
      {conversations.map(
        (conversation) => (
          <ChatHistoryItem
            key={conversation.id}
            conversation={conversation}
            isActive={
              conversation.id ===
              activeConversationId
            }
            isDisabled={isDisabled}
            isMenuOpen={
              openMenuConversationId ===
              conversation.id
            }
            onSelect={
              onSelectConversation
            }
            onToggleMenu={
              handleToggleMenu
            }
            onRename={handleRename}
            onDelete={handleDelete}
          />
        )
      )}
    </div>
  );
}

export default ChatHistory;