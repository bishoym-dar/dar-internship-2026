import { Bot, PanelLeftClose, Plus } from "lucide-react";

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
}) {
  return (
    <aside
      className={`flex h-screen shrink-0 flex-col overflow-hidden border-r border-[#4D3A4D]/10 bg-[#F7EEEE] transition-[width] duration-300 ease-in-out ${
        isOpen ? "w-72" : "w-0 border-r-0"
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
          aria-label="Close sidebar"
          className="flex size-9 items-center justify-center rounded-lg text-[#4D3A4D] transition hover:bg-[#BE5CA9]/15"
        >
          <PanelLeftClose className="size-5" />
        </button>
      </div>

      <div className="min-w-72 p-3">
        <button
          type="button"
          disabled={isChatBusy}
          onClick={onNewChat}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-[#4D3A4D] px-4 py-3 text-sm font-medium text-white transition hover:bg-[#4D3A4D]/90 disabled:cursor-not-allowed disabled:opacity-50"
        >
          <Plus className="size-4" />
          New Chat
        </button>
      </div>

      <div className="min-h-0 min-w-72 flex-1 overflow-y-auto px-3 pb-3">
        <p className="mb-2 px-3 text-xs font-semibold uppercase tracking-wider text-[#4D3A4D]/50">
          Recent chats
        </p>

        <ChatHistory
          conversations={conversations}
          activeConversationId={activeConversationId}
          isLoading={isLoadingConversations}
          isDisabled={isChatBusy}
          onSelectConversation={onSelectConversation}
        />
      </div>

      <div className="min-w-72 border-t border-[#4D3A4D]/10 p-4">
        <div className="flex items-center gap-2 text-xs text-[#4D3A4D]/65">
          <span className="size-2 rounded-full bg-green-500" />
          MongoDB connected
        </div>
      </div>
    </aside>
  );
}

export default Sidebar;