import {
  Bot,
  CircleHelp,
  Menu,
} from "lucide-react";

function Header({
  onToggleSidebar,
  onStartTour,
}) {
  return (
    <header className="border-b border-white/10 bg-[#4D3A4D] text-white">
      <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onToggleSidebar}
          data-tour="sidebar-toggle"
          aria-label="Toggle sidebar"
          title="Toggle sidebar"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#BE5CA9]"
        >
          <Menu className="size-5" />
        </button>

        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#BE5CA9]">
          <Bot className="size-5" />
        </div>

        <div className="min-w-0">
          <h1 className="truncate font-semibold leading-none">
            RAG Assistant
          </h1>

          <p className="mt-1 hidden truncate text-xs text-white/70 sm:block">
            Ask questions about your documents
          </p>
        </div>

        <div className="ml-auto">
          <button
            type="button"
            onClick={onStartTour}
            data-tour="help"
            aria-label="Open guided tour"
            title="Guided Tour"
            className="flex h-10 items-center justify-center gap-2 rounded-xl px-3 text-sm font-medium text-white/85 transition hover:bg-white/10 hover:text-white focus:outline-none focus:ring-2 focus:ring-[#BE5CA9]"
          >
            <CircleHelp className="size-4" />

            <span className="hidden sm:inline">
              Guided Tour
            </span>
          </button>
        </div>
      </div>
    </header>
  );
}

export default Header;