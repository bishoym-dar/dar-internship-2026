import {
  useEffect,
  useRef,
} from "react";

import {
  Bot,
  Boxes,
  ShieldCheck,
} from "lucide-react";

import MessageBubble from "@/components/chat/MessageBubble";
import { ScrollArea } from "@/components/ui/scroll-area";

const SUGGESTED_QUESTIONS = [
  {
    icon: Boxes,
    text: "What is an enterprise asset?",
  },
  {
    icon: ShieldCheck,
    text: "Why is asset inventory important?",
  },
];

function ChatWindow({
  messages,
  isThinking,
  streamingMessageId,
  isChatBusy,
  onSuggestedQuestion,
  onRegenerate,
  onSelectVersion,
  onSubmitFeedback,
}) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView(
      {
        behavior: "smooth",
        block: "end",
      }
    );
  }, [messages, isThinking]);

  const showEmptyState =
    messages.length === 0 &&
    !isThinking;

  return (
    <div className="min-h-0 flex-1 overflow-hidden">
      <ScrollArea className="h-full">
        {showEmptyState ? (
          <div className="flex min-h-full items-center justify-center px-6 py-12">
            <div className="w-full max-w-2xl text-center">
              <div className="mx-auto flex size-16 items-center justify-center rounded-2xl bg-[#4D3A4D] text-white shadow-lg">
                <Bot className="size-7" />
              </div>

              <h2 className="mt-5 text-2xl font-bold text-[#4D3A4D]">
                RAG Assistant
              </h2>

              <p className="mx-auto mt-2 max-w-lg text-sm leading-6 text-[#4D3A4D]/65">
                Ask questions about the
                CIS Controls and your
                indexed documents.
              </p>

              <div className="mx-auto mt-8 max-w-xl">
                <p className="mb-3 text-left text-xs font-semibold uppercase tracking-wider text-[#4D3A4D]/50">
                  Suggested questions
                </p>

                <div className="grid gap-3 sm:grid-cols-2">
                  {SUGGESTED_QUESTIONS.map(
                    ({
                      icon:
                        QuestionIcon,
                      text,
                    }) => (
                      <button
                        key={text}
                        type="button"
                        disabled={
                          isChatBusy
                        }
                        onClick={() =>
                          onSuggestedQuestion?.(
                            text
                          )
                        }
                        className="group flex items-center gap-3 rounded-2xl border border-[#4D3A4D]/10 bg-white/55 p-4 text-left shadow-sm transition hover:-translate-y-0.5 hover:border-[#BE5CA9]/40 hover:bg-white/80 hover:shadow-md disabled:cursor-not-allowed disabled:opacity-60"
                      >
                        <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#BE5CA9]/12 text-[#BE5CA9] transition group-hover:bg-[#BE5CA9] group-hover:text-white">
                          <QuestionIcon className="size-5" />
                        </div>

                        <span className="text-sm font-medium leading-5 text-[#4D3A4D]">
                          {text}
                        </span>
                      </button>
                    )
                  )}
                </div>
              </div>
            </div>
          </div>
        ) : (
          <div className="space-y-4 p-6">
            {messages.map(
              (message) => (
                <MessageBubble
                  key={message.id}
                  messageId={
                    message.id
                  }
                  role={message.role}
                  respondedInSeconds={
                    message
                      .respondedInSeconds
                  }
                  isError={
                    message.isError
                  }
                  isStreaming={
                    message.id ===
                    streamingMessageId
                  }
                  isRegenerating={
                    message
                      .isRegenerating
                  }
                  isChatBusy={
                    isChatBusy
                  }
                  sources={
                    message.sources ??
                    []
                  }
                  versions={
                    message.versions ??
                    []
                  }
                  activeVersion={
                    message
                      .activeVersion ??
                    0
                  }
                  onRegenerate={() =>
                    onRegenerate?.(
                      message.id
                    )
                  }
                  onPreviousVersion={() =>
                    onSelectVersion?.(
                      message.id,
                      (
                        message
                          .activeVersion ??
                        0
                      ) - 1
                    )
                  }
                  onNextVersion={() =>
                    onSelectVersion?.(
                      message.id,
                      (
                        message
                          .activeVersion ??
                        0
                      ) + 1
                    )
                  }
                  onSubmitFeedback={
                    onSubmitFeedback
                  }
                >
                  {message.content}
                </MessageBubble>
              )
            )}

            {isThinking && (
              <div className="flex items-center gap-3 px-1 py-2 text-sm text-[#4D3A4D]">
                <div className="flex items-center gap-1">
                  <span className="h-2 w-2 animate-pulse rounded-full bg-[#BE5CA9]" />

                  <span
                    className="h-2 w-2 animate-pulse rounded-full bg-[#BE5CA9]"
                    style={{
                      animationDelay:
                        "150ms",
                    }}
                  />

                  <span
                    className="h-2 w-2 animate-pulse rounded-full bg-[#BE5CA9]"
                    style={{
                      animationDelay:
                        "300ms",
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
        )}
      </ScrollArea>
    </div>
  );
}

export default ChatWindow;