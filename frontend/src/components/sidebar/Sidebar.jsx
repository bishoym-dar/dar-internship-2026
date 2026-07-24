import {
  useMemo,
  useState,
} from "react";

import {
  Bot,
  PanelLeftClose,
  Plus,
  Search,
  X,
} from "lucide-react";

import ChatHistory from "@/components/sidebar/ChatHistory";

function Sidebar({
  isOpen,
  conversations,
  activeConversationId,
  isLoadingConversations,
  isChatBusy,
  onClose,
  onNewChat,
  onSelectConversation,
  onRenameConversation,
  onDeleteConversation,
}) {
  const [
    searchQuery,
    setSearchQuery,
  ] = useState("");

  const filteredConversations =
    useMemo(() => {
      const cleanQuery = searchQuery
        .trim()
        .toLowerCase();

      if (!cleanQuery) {
        return conversations;
      }

      return conversations.filter(
        (conversation) =>
          (
            conversation.title || ""
          )
            .toLowerCase()
            .includes(cleanQuery)
      );
    }, [conversations, searchQuery]);

  function handleNewChat() {
    setSearchQuery("");
    onNewChat();
  }

  return (
    <aside
      data-tour="sidebar"
      className={`flex h-screen shrink-0 flex-col overflow-hidden border-r border-[#4D3A4D]/10 bg-[#F7EEEE] transition-[width] duration-300 ease-in-out ${
        isOpen
          ? "w-72"
          : "w-0 border-r-0"
      }`}
    >
      <div className="flex h-16 min-w-72 items-center justify-between border-b border-[#4D3A4D]/10 px-4">
        <div className="flex items-center gap-3">
          <div className="flex size-9 items-center justify-center rounded-xl bg-[#BE5CA9] text-white">
            <Bot className="size-4" />
          </div>

          <div>
            <p className="font-semibold text-[#4D3A4D]">
              RAG Assistant
            </p>

            <p className="text-xs text-[#4D3A4D]/60">
              CIS knowledge system
            </p>
          </div>
        </div>

        <button
          type="button"
          onClick={onClose}
          data-tour="sidebar-close"
          aria-label="Close sidebar"
          title="Close sidebar"
          className="flex size-9 items-center justify-center rounded-lg text-[#4D3A4D] transition hover:bg-[#BE5CA9]/15"
        >
          <PanelLeftClose className="size-5" />
        </button>
      </div>

      <div className="min-w-72 space-y-3 p-3">
        <button
          type="button"
          disabled={isChatBusy}
          onClick={handleNewChat}
          data-tour="new-chat"
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4D3A4D] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#4D3A4D]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          New Chat
        </button>

        <div
          data-tour="conversation-search"
          className="relative"
        >
          <Search className="pointer-events-none absolute left-3 top-1/2 size-4 -translate-y-1/2 text-[#4D3A4D]/45" />

          <input
            type="text"
            value={searchQuery}
            onChange={(event) =>
              setSearchQuery(
                event.target.value
              )
            }
            placeholder="Search conversations..."
            aria-label="Search conversations"
            className="w-full rounded-xl border border-[#4D3A4D]/10 bg-white/70 py-2.5 pl-9 pr-9 text-sm text-[#4D3A4D] outline-none transition placeholder:text-[#4D3A4D]/40 focus:border-[#BE5CA9]/60 focus:ring-2 focus:ring-[#BE5CA9]/15"
          />

          {searchQuery && (
            <button
              type="button"
              onClick={() =>
                setSearchQuery("")
              }
              aria-label="Clear conversation search"
              className="absolute right-2 top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-lg text-[#4D3A4D]/55 transition hover:bg-[#BE5CA9]/15 hover:text-[#4D3A4D]"
            >
              <X className="size-4" />
            </button>
          )}
        </div>
      </div>

      <div className="min-h-0 min-w-72 flex-1 overflow-y-auto px-3 pb-3">
        <div className="mb-2 flex items-center justify-between px-3">
          <p className="text-xs font-semibold uppercase tracking-wider text-[#4D3A4D]/50">
            Recent chats
          </p>

          {!isLoadingConversations && (
            <span className="rounded-full bg-[#4D3A4D]/8 px-2 py-0.5 text-[11px] font-medium text-[#4D3A4D]/55">
              {
                filteredConversations.length
              }
            </span>
          )}
        </div>

        <div data-tour="conversation-history">
          <ChatHistory
            conversations={
              filteredConversations
            }
            activeConversationId={
              activeConversationId
            }
            isLoading={
              isLoadingConversations
            }
            isDisabled={isChatBusy}
            hasSearchQuery={Boolean(
              searchQuery.trim()
            )}
            onSelectConversation={
              onSelectConversation
            }
            onRenameConversation={
              onRenameConversation
            }
            onDeleteConversation={
              onDeleteConversation
            }
          />
        </div>
      </div>

      <div className="min-w-72 border-t border-[#4D3A4D]/10 p-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-2 text-xs text-[#4D3A4D]/65">
            <span className="size-2 rounded-full bg-green-500" />
            MongoDB connected
          </div>

          <span className="text-[10px] font-medium uppercase tracking-wider text-[#4D3A4D]/35">
            Local
          </span>
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;