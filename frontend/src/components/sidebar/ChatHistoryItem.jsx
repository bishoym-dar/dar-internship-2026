import {
  BookOpen,
  Boxes,
  FileText,
  Laptop,
  MessageSquare,
  MoreHorizontal,
  Pencil,
  ShieldCheck,
  Trash2,
} from "lucide-react";

function getConversationIcon(
  title = ""
) {
  const normalizedTitle =
    title.toLowerCase();

  if (
    normalizedTitle.includes(
      "cis"
    ) ||
    normalizedTitle.includes(
      "control"
    ) ||
    normalizedTitle.includes(
      "security"
    )
  ) {
    return ShieldCheck;
  }

  if (
    normalizedTitle.includes(
      "asset"
    ) ||
    normalizedTitle.includes(
      "inventory"
    )
  ) {
    return Boxes;
  }

  if (
    normalizedTitle.includes(
      "device"
    ) ||
    normalizedTitle.includes(
      "computer"
    ) ||
    normalizedTitle.includes(
      "enterprise"
    )
  ) {
    return Laptop;
  }

  if (
    normalizedTitle.includes(
      "document"
    ) ||
    normalizedTitle.includes(
      "source"
    ) ||
    normalizedTitle.includes(
      "file"
    )
  ) {
    return FileText;
  }

  if (
    normalizedTitle.includes(
      "explain"
    ) ||
    normalizedTitle.includes(
      "summary"
    ) ||
    normalizedTitle.includes(
      "guide"
    )
  ) {
    return BookOpen;
  }

  return MessageSquare;
}

function formatConversationTime(
  dateValue
) {
  if (!dateValue) {
    return "";
  }

  const date = new Date(dateValue);

  if (
    Number.isNaN(date.getTime())
  ) {
    return "";
  }

  const now = new Date();

  const differenceMilliseconds =
    now.getTime() - date.getTime();

  const differenceMinutes =
    Math.floor(
      differenceMilliseconds /
        60000
    );

  if (differenceMinutes < 1) {
    return "Just now";
  }

  if (differenceMinutes < 60) {
    return `${differenceMinutes}m ago`;
  }

  const differenceHours =
    Math.floor(
      differenceMinutes / 60
    );

  if (differenceHours < 24) {
    return `${differenceHours}h ago`;
  }

  const differenceDays =
    Math.floor(
      differenceHours / 24
    );

  if (differenceDays === 1) {
    return "Yesterday";
  }

  if (differenceDays < 7) {
    return `${differenceDays}d ago`;
  }

  return date.toLocaleDateString(
    undefined,
    {
      month: "short",
      day: "numeric",
    }
  );
}

function ChatHistoryItem({
  conversation,
  isActive,
  isDisabled,
  isMenuOpen,
  onSelect,
  onToggleMenu,
  onRename,
  onDelete,
}) {
  const ConversationIcon =
    getConversationIcon(
      conversation.title
    );

  const formattedTime =
    formatConversationTime(
      conversation.updated_at
    );

  function handleToggleMenu(
    event
  ) {
    event.stopPropagation();
    onToggleMenu(conversation.id);
  }

  function handleRename(event) {
    event.stopPropagation();
    onRename(conversation);
  }

  function handleDelete(event) {
    event.stopPropagation();
    onDelete(conversation);
  }

  return (
    <div
      data-tour="conversation-item"
      className="group relative"
    >
      <button
        type="button"
        disabled={isDisabled}
        onClick={() =>
          onSelect(conversation.id)
        }
        title={conversation.title}
        className={`flex w-full items-center gap-3 rounded-xl px-3 py-2.5 pr-10 text-left transition ${
          isActive
            ? "bg-[#BE5CA9] text-white shadow-sm"
            : "text-[#4D3A4D] hover:bg-[#BE5CA9]/15"
        } disabled:cursor-not-allowed disabled:opacity-50`}
      >
        <div
          className={`flex size-8 shrink-0 items-center justify-center rounded-lg transition ${
            isActive
              ? "bg-white/15 text-white"
              : "bg-[#BE5CA9]/10 text-[#BE5CA9] group-hover:bg-[#BE5CA9]/15"
          }`}
        >
          <ConversationIcon className="size-4" />
        </div>

        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-medium">
            {conversation.title ||
              "Untitled Chat"}
          </p>

          {formattedTime && (
            <p
              className={`mt-0.5 truncate text-[11px] ${
                isActive
                  ? "text-white/70"
                  : "text-[#4D3A4D]/45"
              }`}
            >
              {formattedTime}
            </p>
          )}
        </div>
      </button>

      <button
        type="button"
        disabled={isDisabled}
        onClick={handleToggleMenu}
        data-tour="conversation-actions"
        aria-label={`Open actions for ${
          conversation.title ||
          "conversation"
        }`}
        title="Conversation actions"
        className={`absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg transition ${
          isActive
            ? "text-white/75 hover:bg-white/15 hover:text-white"
            : "text-[#4D3A4D]/55 hover:bg-[#BE5CA9]/15 hover:text-[#4D3A4D]"
        } ${
          isMenuOpen
            ? "opacity-100"
            : "opacity-0 group-hover:opacity-100 focus:opacity-100"
        } disabled:cursor-not-allowed disabled:opacity-30`}
      >
        <MoreHorizontal className="size-4" />
      </button>

      {isMenuOpen && (
        <div
          data-tour="conversation-menu"
          className="absolute right-2 top-[calc(100%-4px)] z-40 w-36 overflow-hidden rounded-xl border border-[#4D3A4D]/10 bg-[#FFF8F8] p-1.5 shadow-xl"
          onClick={(event) =>
            event.stopPropagation()
          }
        >
          <button
            type="button"
            onClick={handleRename}
            data-tour="rename-conversation"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-[#4D3A4D] transition hover:bg-[#BE5CA9]/12"
          >
            <Pencil className="size-3.5" />
            Rename
          </button>

          <button
            type="button"
            onClick={handleDelete}
            data-tour="delete-conversation"
            className="flex w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-sm text-red-600 transition hover:bg-red-50"
          >
            <Trash2 className="size-3.5" />
            Delete
          </button>
        </div>
      )}
    </div>
  );
}

export default ChatHistoryItem;