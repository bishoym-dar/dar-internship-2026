import { MessageSquare } from "lucide-react";

function ChatHistoryItem({
  conversation,
  isActive,
  isDisabled,
  onSelect,
}) {
  return (
    <button
      type="button"
      disabled={isDisabled}
      onClick={() => onSelect(conversation.id)}
      title={conversation.title}
      className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left text-sm transition ${
        isActive
          ? "bg-[#BE5CA9] text-white shadow-sm"
          : "text-[#4D3A4D] hover:bg-[#BE5CA9]/15"
      } disabled:cursor-not-allowed disabled:opacity-50`}
    >
      <MessageSquare className="size-4 shrink-0" />

      <span className="truncate">
        {conversation.title || "Untitled Chat"}
      </span>
    </button>
  );
}

export default ChatHistoryItem;