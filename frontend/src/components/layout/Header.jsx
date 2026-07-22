import { Bot } from "lucide-react";

function Header() {
  return (
    <header className="border-b border-white/10 bg-[#4D3A4D] text-white">
      <div className="mx-auto flex h-16 w-full max-w-5xl items-center gap-3 px-4 sm:px-6">
        <div className="flex size-10 items-center justify-center rounded-xl bg-[#BE5CA9]">
          <Bot className="size-5" />
        </div>

        <div>
          <h1 className="font-semibold leading-none">RAG Assistant</h1>
          <p className="mt-1 text-xs text-white/70">
            Ask questions about your documents
          </p>
        </div>
      </div>
    </header>
  );
}

export default Header;