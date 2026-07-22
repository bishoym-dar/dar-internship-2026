import { ScrollArea } from "@/components/ui/scroll-area";
import MessageBubble from "./MessageBubble";

function ChatWindow({ messages, isLoading }) {
  return (
    <ScrollArea className="min-h-0 flex-1">
      <div className="mx-auto flex w-full max-w-5xl flex-col gap-6 px-4 py-8 sm:px-6">
        {messages.length === 0 && !isLoading ? (
          <div className="flex min-h-[50vh] items-center justify-center">
            <p className="text-center text-sm text-[#4D3A4D]/60">
              Start a conversation by typing a message below.
            </p>
          </div>
        ) : (
          <>
            {messages.map((message) => (
              <MessageBubble key={message.id} role={message.role}>
                {message.content}
              </MessageBubble>
            ))}

            {isLoading && (
              <MessageBubble role="assistant">
                Thinking...
              </MessageBubble>
            )}
          </>
        )}
      </div>
    </ScrollArea>
  );
}

export default ChatWindow;