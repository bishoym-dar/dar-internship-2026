import { Bot, User } from "lucide-react";

function MessageBubble({ role, children }) {
  const isUser = role === "user";

  return (
    <div
      className={`flex items-start gap-3 ${
        isUser ? "justify-end" : "justify-start"
      }`}
    >
      {!isUser && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#4D3A4D] text-white">
          <Bot className="size-4" />
        </div>
      )}

      <div
        className={`max-w-[80%] rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
          isUser
            ? "rounded-br-md bg-[#BE5CA9] text-white"
            : "rounded-bl-md border border-[#4D3A4D]/15 bg-[#D59CC5] text-[#4D3A4D]"
        }`}
      >
        {children}
      </div>

      {isUser && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#BE5CA9] text-white">
          <User className="size-4" />
        </div>
      )}
    </div>
  );
}

export default MessageBubble;