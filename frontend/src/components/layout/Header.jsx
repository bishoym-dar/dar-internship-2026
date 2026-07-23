import { Bot, Menu } from "lucide-react";

function Header({
  onToggleSidebar,
}) {
  return (
    <header className="border-b border-white/10 bg-[#4D3A4D] text-white">
      <div className="flex h-16 w-full items-center gap-3 px-4 sm:px-6">
        <button
          type="button"
          onClick={onToggleSidebar}
          aria-label="Toggle sidebar"
          className="flex size-10 shrink-0 items-center justify-center rounded-xl transition hover:bg-white/10 focus:outline-none focus:ring-2 focus:ring-[#BE5CA9]"
        >
          <Menu className="size-5" />
        </button>

        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#BE5CA9]">
          <Bot className="size-5" />
        </div>

        <div>
          <h1 className="font-semibold leading-none">
            RAG Assistant
          </h1>

          <p className="mt-1 text-xs text-white/70">
            Ask questions about your documents
          </p>
        </div>
      </div>
    </header>
  );
}

export default Header;