import { useEffect, useRef } from "react";

import MessageBubble from "@/components/chat/MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";

function ChatWindow({
  messages,
  isThinking,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({
      behavior: "smooth",
      block: "end",
    });
  }, [messages, isThinking]);

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <ScrollArea className="h-full">
        <div className="space-y-4 p-6">
          {messages.map((message) => (
            <MessageBubble
              key={message.id}
              role={message.role}
              respondedInSeconds={message.respondedInSeconds}
              isError={message.isError}
            >
              {message.content}
            </MessageBubble>
          ))}

          {isThinking && (
            <div className="flex items-center gap-3 px-1 py-2 text-sm text-[#4D3A4D]">
              <div className="flex items-center gap-1">
                <span className="h-2 w-2 animate-pulse rounded-full bg-[#BE5CA9]" />

                <span
                  className="h-2 w-2 animate-pulse rounded-full bg-[#BE5CA9]"
                  style={{
                    animationDelay: "150ms",
                  }}
                />

                <span
                  className="h-2 w-2 animate-pulse rounded-full bg-[#BE5CA9]"
                  style={{
                    animationDelay: "300ms",
                  }}
                />
              </div>

              <span className="font-medium">
                Thinking...
              </span>
            </div>
          )}

          <div ref={bottomRef} />
        </div>
      </ScrollArea>
    </div>
  );
}

export default ChatWindow;