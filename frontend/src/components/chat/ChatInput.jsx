import { useState } from "react";
import { Send } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Textarea } from "@/components/ui/textarea";

function ChatInput({
  onSendMessage,
  isLoading,
}) {
  const [message, setMessage] =
    useState("");

  function handleSubmit(event) {
    event.preventDefault();

    if (
      !message.trim() ||
      isLoading
    ) {
      return;
    }

    onSendMessage(message);
    setMessage("");
  }

  function handleKeyDown(event) {
    if (
      event.key === "Enter" &&
      !event.shiftKey
    ) {
      event.preventDefault();
      handleSubmit(event);
    }
  }

  return (
    <footer className="border-t border-[#4D3A4D]/15 bg-[#EADADA]">
      <form
        onSubmit={handleSubmit}
        className="mx-auto w-full max-w-5xl px-4 py-4 sm:px-6"
      >
        <div
          data-tour="message-input-area"
          className="flex items-end gap-2 rounded-2xl border border-[#4D3A4D]/20 bg-white/70 p-2 shadow-sm backdrop-blur"
        >
          <Textarea
            value={message}
            onChange={(event) =>
              setMessage(
                event.target.value
              )
            }
            onKeyDown={handleKeyDown}
            data-tour="message-input"
            placeholder="Ask a question..."
            aria-label="Ask a question"
            className="min-h-11 max-h-40 resize-none border-0 bg-transparent text-[#4D3A4D] placeholder:text-[#4D3A4D]/50 shadow-none focus-visible:ring-0"
          />

          <Button
            type="submit"
            size="icon"
            disabled={
              !message.trim() ||
              isLoading
            }
            data-tour="send-message"
            aria-label="Send message"
            title="Send message"
            className="rounded-xl bg-[#BE5CA9] text-white hover:bg-[#BE5CA9]/90 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Send className="size-4" />
          </Button>
        </div>

        <p className="mt-2 text-center text-xs text-[#4D3A4D]/60">
          Press Enter to send • Shift +
          Enter for a new line
        </p>
      </form>
    </footer>
  );
}

export default ChatInput;