import ChatHistoryItem from "@/components/sidebar/ChatHistoryItem";

function ChatHistory({
  conversations,
  activeConversationId,
  isLoading,
  isDisabled,
  onSelectConversation,
}) {
  if (isLoading) {
    return (
      <div className="space-y-2 px-2">
        <div className="h-10 animate-pulse rounded-xl bg-[#4D3A4D]/10" />
        <div className="h-10 animate-pulse rounded-xl bg-[#4D3A4D]/10" />
        <div className="h-10 animate-pulse rounded-xl bg-[#4D3A4D]/10" />
      </div>
    );
  }

  if (conversations.length === 0) {
    return (
      <p className="px-3 py-4 text-sm text-[#4D3A4D]/60">
        No saved chats yet.
      </p>
    );
  }

  return (
    <div className="space-y-1">
      {conversations.map((conversation) => (
        <ChatHistoryItem
          key={conversation.id}
          conversation={conversation}
          isActive={
            conversation.id === activeConversationId
          }
          isDisabled={isDisabled}
          onSelect={onSelectConversation}
        />
      ))}
    </div>
  );
}

export default ChatHistory;