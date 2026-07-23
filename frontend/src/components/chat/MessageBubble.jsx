import { Bot, User } from "lucide-react";
import ReactMarkdown from "react-markdown";
import remarkGfm from "remark-gfm";

function MessageBubble({
  role,
  children,
  respondedInSeconds,
  isError = false,
}) {
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

      <div className="flex max-w-[80%] flex-col">
        <div
          className={`rounded-2xl px-4 py-3 text-sm leading-relaxed shadow-sm ${
            isUser
              ? "rounded-br-md bg-[#BE5CA9] text-white"
              : isError
              ? "rounded-bl-md border border-red-300 bg-red-50 text-red-700"
              : "rounded-bl-md border border-[#4D3A4D]/15 bg-[#D59CC5] text-[#4D3A4D]"
          }`}
        >
          {isUser ? (
            children
          ) : (
            <ReactMarkdown
              remarkPlugins={[remarkGfm]}
              components={{
                h1: ({ children }) => (
                  <h1 className="mb-3 text-2xl font-bold">
                    {children}
                  </h1>
                ),

                h2: ({ children }) => (
                  <h2 className="mb-2 mt-5 text-xl font-semibold">
                    {children}
                  </h2>
                ),

                h3: ({ children }) => (
                  <h3 className="mb-2 mt-4 text-lg font-semibold">
                    {children}
                  </h3>
                ),

                p: ({ children }) => (
                  <p className="mb-3 leading-7">
                    {children}
                  </p>
                ),

                ul: ({ children }) => (
                  <ul className="mb-3 list-disc space-y-1 pl-6">
                    {children}
                  </ul>
                ),

                ol: ({ children }) => (
                  <ol className="mb-3 list-decimal space-y-1 pl-6">
                    {children}
                  </ol>
                ),

                li: ({ children }) => (
                  <li>{children}</li>
                ),

                strong: ({ children }) => (
                  <strong className="font-bold">
                    {children}
                  </strong>
                ),

                em: ({ children }) => (
                  <em className="italic">
                    {children}
                  </em>
                ),

                a: ({ children, href }) => (
                  <a
                    href={href}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="text-blue-700 underline"
                  >
                    {children}
                  </a>
                ),

                table: ({ children }) => (
                  <div className="my-4 overflow-x-auto">
                    <table className="w-full border-collapse border border-[#4D3A4D]/20">
                      {children}
                    </table>
                  </div>
                ),

                thead: ({ children }) => (
                  <thead className="bg-[#BE5CA9]/15">
                    {children}
                  </thead>
                ),

                th: ({ children }) => (
                  <th className="border border-[#4D3A4D]/20 px-3 py-2 text-left font-semibold">
                    {children}
                  </th>
                ),

                td: ({ children }) => (
                  <td className="border border-[#4D3A4D]/20 px-3 py-2">
                    {children}
                  </td>
                ),

                code({ inline, children }) {
                  if (inline) {
                    return (
                      <code className="rounded bg-[#4D3A4D]/10 px-1.5 py-0.5 font-mono text-sm">
                        {children}
                      </code>
                    );
                  }

                  return (
                    <pre className="my-3 overflow-x-auto rounded-lg bg-[#4D3A4D] p-4 text-white">
                      <code>{children}</code>
                    </pre>
                  );
                },
              }}
            >
              {children}
            </ReactMarkdown>
          )}
        </div>

        {!isUser &&
          !isError &&
          typeof respondedInSeconds === "number" && (
            <p className="mt-1.5 px-1 text-xs text-[#4D3A4D]/65">
              Responded in {respondedInSeconds.toFixed(1)} seconds
            </p>
          )}
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