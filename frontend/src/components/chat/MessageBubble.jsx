import {
  useEffect,
  useMemo,
  useState,
} from "react";

import {
  Bot,
  Check,
  ChevronLeft,
  ChevronRight,
  Copy,
  FileText,
  RefreshCw,
  ThumbsDown,
  ThumbsUp,
  User,
  X,
} from "lucide-react";

import ReactMarkdown, {
  defaultUrlTransform,
} from "react-markdown";

import remarkGfm from "remark-gfm";

const CITATION_PATTERN =
  /(?:\[|\()\s*Source\s+(\d+)(?:\s*\|\s*Chunk\s+([^\]\)]+))?\s*(?:\]|\))/gi;

const FEEDBACK_REASONS = [
  "Incorrect answer",
  "Missing information",
  "Hallucination",
  "Poor explanation",
  "Sources not useful",
  "Other",
];

function convertCitationsToLinks(
  content
) {
  return content.replace(
    CITATION_PATTERN,
    (
      _fullMarker,
      sourceNumber,
      chunkId
    ) => {
      const cleanChunkId =
        chunkId?.trim() ?? "";

      const label = cleanChunkId
        ? `Source ${sourceNumber} · Chunk ${cleanChunkId}`
        : `Source ${sourceNumber}`;

      const chunkPath =
        cleanChunkId
          ? `/chunk/${encodeURIComponent(
              cleanChunkId
            )}`
          : "";

      return `[${label}](citation://source/${sourceNumber}${chunkPath})`;
    }
  );
}

function findCitationSource(
  sources,
  sourceNumber,
  chunkId
) {
  const bySourceNumber =
    sources.find(
      (source) =>
        Number(
          source.source_number
        ) === Number(sourceNumber)
    );

  if (bySourceNumber) {
    return bySourceNumber;
  }

  if (!chunkId) {
    return null;
  }

  return (
    sources.find(
      (source) =>
        String(source.chunk_id) ===
        String(chunkId)
    ) ?? null
  );
}

function MessageBubble({
  messageId,
  role,
  children,
  respondedInSeconds,
  isError = false,
  isStreaming = false,
  isRegenerating = false,
  isChatBusy = false,
  sources = [],
  versions = [],
  activeVersion = 0,
  onRegenerate,
  onPreviousVersion,
  onNextVersion,
  onSubmitFeedback,
}) {
  const [
    isCopied,
    setIsCopied,
  ] = useState(false);

  const [
    selectedSource,
    setSelectedSource,
  ] = useState(null);

  const [
    isFeedbackModalOpen,
    setIsFeedbackModalOpen,
  ] = useState(false);

  const [
    selectedReason,
    setSelectedReason,
  ] = useState("");

  const [
    feedbackComment,
    setFeedbackComment,
  ] = useState("");

  const [
    isSubmittingFeedback,
    setIsSubmittingFeedback,
  ] = useState(false);

  const [
    feedbackError,
    setFeedbackError,
  ] = useState("");

  const isUser =
    role === "user";

  const messageContent =
    typeof children === "string"
      ? children
      : String(children ?? "");

  const markdownContent = useMemo(
    () =>
      convertCitationsToLinks(
        messageContent
      ),
    [messageContent]
  );

  const versionCount =
    versions.length;

  const hasMultipleVersions =
    versionCount > 1;

  const canGoPrevious =
    activeVersion > 0;

  const canGoNext =
    activeVersion <
    versionCount - 1;

  const currentVersion =
    versions[activeVersion] ?? null;

  const currentVersionId =
    currentVersion?.versionId ?? null;

  const feedbackRating =
    currentVersion?.feedback?.rating ?? null;

  const hasPositiveFeedback =
    feedbackRating === "up";

  const hasNegativeFeedback =
    feedbackRating === "down";

  const actionButtonClass =
    "flex size-7 items-center justify-center rounded-lg text-[#4D3A4D]/55 transition hover:bg-[#BE5CA9]/15 hover:text-[#4D3A4D] disabled:cursor-not-allowed disabled:opacity-35 disabled:hover:bg-transparent";

  useEffect(() => {
    if (!isCopied) {
      return undefined;
    }

    const timeoutId =
      window.setTimeout(() => {
        setIsCopied(false);
      }, 2000);

    return () => {
      window.clearTimeout(
        timeoutId
      );
    };
  }, [isCopied]);

  async function handleCopy() {
    try {
      await navigator.clipboard.writeText(
        messageContent
      );

      setIsCopied(true);
    } catch (error) {
      console.error(
        "The response could not be copied:",
        error
      );
    }
  }

  async function handlePositiveFeedback() {
    if (
      !onSubmitFeedback ||
      !messageId ||
      !currentVersionId ||
      isSubmittingFeedback
    ) {
      return;
    }

    setFeedbackError("");
    setIsSubmittingFeedback(true);

    try {
      await onSubmitFeedback({
        messageId,
        versionId: currentVersionId,
        rating: "up",
        reason: null,
        comment: null,
      });

      setIsFeedbackModalOpen(false);
    } catch (error) {
      setFeedbackError(
        error instanceof Error
          ? error.message
          : "The feedback could not be saved."
      );
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  function openNegativeFeedbackModal() {
    setSelectedReason("");
    setFeedbackComment("");
    setFeedbackError("");
    setIsFeedbackModalOpen(true);
  }

  function closeFeedbackModal() {
    if (isSubmittingFeedback) {
      return;
    }

    setIsFeedbackModalOpen(false);
    setFeedbackError("");
  }

  async function handleNegativeFeedbackSubmit(event) {
    event.preventDefault();

    if (
      !selectedReason ||
      !onSubmitFeedback ||
      !messageId ||
      !currentVersionId
    ) {
      setFeedbackError(
        "Please select a reason before submitting."
      );
      return;
    }

    setFeedbackError("");
    setIsSubmittingFeedback(true);

    try {
      await onSubmitFeedback({
        messageId,
        versionId: currentVersionId,
        rating: "down",
        reason: selectedReason,
        comment:
          feedbackComment.trim() || null,
      });

      setIsFeedbackModalOpen(false);
    } catch (error) {
      setFeedbackError(
        error instanceof Error
          ? error.message
          : "The feedback could not be saved."
      );
    } finally {
      setIsSubmittingFeedback(false);
    }
  }

  function renderLink({
    children: linkChildren,
    href,
  }) {
    if (
      href?.startsWith(
        "citation://"
      )
    ) {
      const citationMatch =
        href.match(
          /^citation:\/\/source\/(\d+)(?:\/chunk\/(.+))?$/
        );

      const sourceNumber =
        citationMatch?.[1];

      const chunkId =
        citationMatch?.[2]
          ? decodeURIComponent(
              citationMatch[2]
            )
          : null;

      const matchingSource =
        findCitationSource(
          sources,
          sourceNumber,
          chunkId
        );

      return (
        <button
          type="button"
          disabled={!matchingSource}
          data-tour="citation"
          onClick={() => {
            if (matchingSource) {
              setSelectedSource(
                matchingSource
              );
            }
          }}
          className="mx-1 inline-flex items-center gap-1 rounded-md border border-[#4D3A4D]/20 bg-white/55 px-1.5 py-0.5 align-middle text-xs font-semibold text-[#4D3A4D] transition enabled:hover:border-[#BE5CA9] enabled:hover:bg-white disabled:cursor-default disabled:opacity-70"
          title={
            matchingSource
              ? "Open source details"
              : "Source metadata is loading"
          }
        >
          <FileText className="size-3" />
          {linkChildren}
        </button>
      );
    }

    return (
      <a
        href={href}
        target="_blank"
        rel="noopener noreferrer"
        className="text-blue-700 underline underline-offset-2"
      >
        {linkChildren}
      </a>
    );
  }

  return (
    <div
      className={`flex items-start gap-3 ${
        isUser
          ? "justify-end"
          : "justify-start"
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
            <div>
              <ReactMarkdown
                remarkPlugins={[
                  remarkGfm,
                ]}
                urlTransform={(
                  url
                ) =>
                  url.startsWith(
                    "citation://"
                  )
                    ? url
                    : defaultUrlTransform(
                        url
                      )
                }
                components={{
                  h1: ({
                    children,
                  }) => (
                    <h1 className="mb-3 text-2xl font-bold">
                      {children}
                    </h1>
                  ),

                  h2: ({
                    children,
                  }) => (
                    <h2 className="mb-2 mt-5 text-xl font-semibold">
                      {children}
                    </h2>
                  ),

                  h3: ({
                    children,
                  }) => (
                    <h3 className="mb-2 mt-4 text-lg font-semibold">
                      {children}
                    </h3>
                  ),

                  p: ({
                    children,
                  }) => (
                    <p className="mb-3 leading-7 last:mb-0">
                      {children}
                    </p>
                  ),

                  ul: ({
                    children,
                  }) => (
                    <ul className="mb-3 list-disc space-y-1 pl-6">
                      {children}
                    </ul>
                  ),

                  ol: ({
                    children,
                  }) => (
                    <ol className="mb-3 list-decimal space-y-1 pl-6">
                      {children}
                    </ol>
                  ),

                  li: ({
                    children,
                  }) => (
                    <li>
                      {children}
                    </li>
                  ),

                  strong: ({
                    children,
                  }) => (
                    <strong className="font-bold">
                      {children}
                    </strong>
                  ),

                  em: ({
                    children,
                  }) => (
                    <em className="italic">
                      {children}
                    </em>
                  ),

                  a: renderLink,

                  table: ({
                    children,
                  }) => (
                    <div className="my-4 overflow-x-auto rounded-lg">
                      <table className="w-full border-collapse border border-[#4D3A4D]/20">
                        {children}
                      </table>
                    </div>
                  ),

                  thead: ({
                    children,
                  }) => (
                    <thead className="bg-[#BE5CA9]/15">
                      {children}
                    </thead>
                  ),

                  th: ({
                    children,
                  }) => (
                    <th className="border border-[#4D3A4D]/20 px-3 py-2 text-left font-semibold">
                      {children}
                    </th>
                  ),

                  td: ({
                    children,
                  }) => (
                    <td className="border border-[#4D3A4D]/20 px-3 py-2">
                      {children}
                    </td>
                  ),

                  code({
                    inline,
                    children,
                  }) {
                    if (inline) {
                      return (
                        <code className="rounded bg-[#4D3A4D]/10 px-1.5 py-0.5 font-mono text-sm">
                          {children}
                        </code>
                      );
                    }

                    return (
                      <pre className="my-3 overflow-x-auto rounded-lg bg-[#4D3A4D] p-4 text-white">
                        <code>
                          {children}
                        </code>
                      </pre>
                    );
                  },
                }}
              >
                {markdownContent}
              </ReactMarkdown>

              {isStreaming &&
                !isError && (
                  <span
                    aria-label="Response is streaming"
                    className="ml-1 inline-block h-4 w-1.5 animate-pulse rounded-sm bg-[#4D3A4D] align-middle"
                  />
                )}
            </div>
          )}
        </div>

        {!isUser && (
          <div
            data-tour="response-actions"
            className="mt-1.5 flex min-h-7 flex-wrap items-center gap-1 px-1"
          >
            {!isError &&
              typeof respondedInSeconds ===
                "number" &&
              !isStreaming && (
                <span className="mr-1 text-xs text-[#4D3A4D]/60">
                  Responded in{" "}
                  {respondedInSeconds.toFixed(
                    1
                  )}{" "}
                  seconds
                </span>
              )}

            {!isError &&
              !isStreaming && (
                <>
                  <button
                    type="button"
                    onClick={
                      handleCopy
                    }
                    data-tour="copy-response"
                    title={
                      isCopied
                        ? "Copied"
                        : "Copy response"
                    }
                    aria-label={
                      isCopied
                        ? "Response copied"
                        : "Copy response"
                    }
                    className={
                      actionButtonClass
                    }
                  >
                    {isCopied ? (
                      <Check className="size-3.5" />
                    ) : (
                      <Copy className="size-3.5" />
                    )}
                  </button>

                  <button
                    type="button"
                    disabled={
                      isChatBusy ||
                      isRegenerating ||
                      !messageId
                    }
                    onClick={
                      onRegenerate
                    }
                    data-tour="regenerate-response"
                    title="Regenerate response"
                    aria-label="Regenerate response"
                    className={
                      actionButtonClass
                    }
                  >
                    <RefreshCw className="size-3.5" />
                  </button>

                  <button
                    type="button"
                    data-tour="feedback-up"
                    disabled={
                      isChatBusy ||
                      isSubmittingFeedback ||
                      !currentVersionId
                    }
                    onClick={
                      handlePositiveFeedback
                    }
                    title={
                      hasPositiveFeedback
                        ? "Feedback submitted"
                        : "Helpful"
                    }
                    aria-label="Mark response as helpful"
                    className={`${actionButtonClass} ${
                      hasPositiveFeedback
                        ? "bg-[#BE5CA9]/15 text-[#BE5CA9]"
                        : ""
                    }`}
                  >
                    <ThumbsUp
                      className="size-3.5"
                      fill={
                        hasPositiveFeedback
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>

                  <button
                    type="button"
                    data-tour="feedback-down"
                    disabled={
                      isChatBusy ||
                      isSubmittingFeedback ||
                      !currentVersionId
                    }
                    onClick={
                      openNegativeFeedbackModal
                    }
                    title={
                      hasNegativeFeedback
                        ? "Feedback submitted"
                        : "Not helpful"
                    }
                    aria-label="Mark response as not helpful"
                    className={`${actionButtonClass} ${
                      hasNegativeFeedback
                        ? "bg-[#BE5CA9]/15 text-[#BE5CA9]"
                        : ""
                    }`}
                  >
                    <ThumbsDown
                      className="size-3.5"
                      fill={
                        hasNegativeFeedback
                          ? "currentColor"
                          : "none"
                      }
                    />
                  </button>
                </>
              )}

            {isStreaming &&
              !isError && (
                <span className="text-xs text-[#4D3A4D]/50">
                  {isRegenerating
                    ? "Regenerating..."
                    : "Streaming..."}
                </span>
              )}

            {!isError &&
              !isStreaming &&
              hasMultipleVersions && (
                <div
                  data-tour="version-navigation"
                  className="ml-1 flex items-center gap-0.5"
                >
                  <button
                    type="button"
                    disabled={
                      !canGoPrevious ||
                      isChatBusy
                    }
                    onClick={
                      onPreviousVersion
                    }
                    title="Previous version"
                    aria-label="Previous response version"
                    className={
                      actionButtonClass
                    }
                  >
                    <ChevronLeft className="size-3.5" />
                  </button>

                  <span className="min-w-10 text-center text-xs tabular-nums text-[#4D3A4D]/60">
                    {activeVersion +
                      1}{" "}
                    / {versionCount}
                  </span>

                  <button
                    type="button"
                    disabled={
                      !canGoNext ||
                      isChatBusy
                    }
                    onClick={
                      onNextVersion
                    }
                    title="Next version"
                    aria-label="Next response version"
                    className={
                      actionButtonClass
                    }
                  >
                    <ChevronRight className="size-3.5" />
                  </button>
                </div>
              )}
          </div>
        )}
      </div>

      {isUser && (
        <div className="flex size-9 shrink-0 items-center justify-center rounded-full bg-[#BE5CA9] text-white">
          <User className="size-4" />
        </div>
      )}

      {isFeedbackModalOpen && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={closeFeedbackModal}
        >
          <form
            role="dialog"
            aria-modal="true"
            aria-labelledby="feedback-title"
            onSubmit={
              handleNegativeFeedbackSubmit
            }
            onClick={(event) =>
              event.stopPropagation()
            }
            className="w-full max-w-md rounded-2xl border border-[#4D3A4D]/15 bg-[#F8EFEF] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#BE5CA9]">
                  Response feedback
                </p>

                <h3
                  id="feedback-title"
                  className="mt-1 text-lg font-bold text-[#4D3A4D]"
                >
                  Why wasn&apos;t this response helpful?
                </h3>
              </div>

              <button
                type="button"
                onClick={
                  closeFeedbackModal
                }
                disabled={
                  isSubmittingFeedback
                }
                className="flex size-8 items-center justify-center rounded-lg text-[#4D3A4D]/60 transition hover:bg-[#4D3A4D]/10 disabled:opacity-40"
                aria-label="Close feedback form"
              >
                <X className="size-4" />
              </button>
            </div>

            <div className="mt-4 flex flex-wrap gap-2">
              {FEEDBACK_REASONS.map(
                (reason) => {
                  const isSelected =
                    selectedReason === reason;

                  return (
                    <button
                      key={reason}
                      type="button"
                      onClick={() => {
                        setSelectedReason(
                          reason
                        );
                        setFeedbackError("");
                      }}
                      className={`rounded-full border px-3 py-1.5 text-xs font-medium transition ${
                        isSelected
                          ? "border-[#BE5CA9] bg-[#BE5CA9] text-white"
                          : "border-[#4D3A4D]/15 bg-white/55 text-[#4D3A4D] hover:border-[#BE5CA9]/60 hover:bg-white"
                      }`}
                    >
                      {reason}
                    </button>
                  );
                }
              )}
            </div>

            <label className="mt-5 block">
              <span className="text-xs font-semibold text-[#4D3A4D]/70">
                Additional comments (optional)
              </span>

              <textarea
                value={feedbackComment}
                onChange={(event) =>
                  setFeedbackComment(
                    event.target.value
                  )
                }
                maxLength={1000}
                rows={4}
                placeholder="Tell us what could be improved..."
                className="mt-2 w-full resize-none rounded-xl border border-[#4D3A4D]/15 bg-white/60 px-3 py-2 text-sm text-[#4D3A4D] outline-none transition placeholder:text-[#4D3A4D]/35 focus:border-[#BE5CA9] focus:ring-2 focus:ring-[#BE5CA9]/15"
              />
            </label>

            {feedbackError && (
              <p className="mt-3 text-xs font-medium text-red-600">
                {feedbackError}
              </p>
            )}

            <div className="mt-5 flex justify-end gap-2">
              <button
                type="button"
                onClick={
                  closeFeedbackModal
                }
                disabled={
                  isSubmittingFeedback
                }
                className="rounded-lg px-3 py-2 text-sm font-medium text-[#4D3A4D]/65 transition hover:bg-[#4D3A4D]/10 disabled:opacity-40"
              >
                Cancel
              </button>

              <button
                type="submit"
                disabled={
                  !selectedReason ||
                  isSubmittingFeedback
                }
                className="rounded-lg bg-[#BE5CA9] px-4 py-2 text-sm font-semibold text-white transition hover:bg-[#A94E96] disabled:cursor-not-allowed disabled:opacity-45"
              >
                {isSubmittingFeedback
                  ? "Submitting..."
                  : "Submit"}
              </button>
            </div>
          </form>
        </div>
      )}

      {selectedSource && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-black/35 p-4"
          onClick={() =>
            setSelectedSource(null)
          }
        >
          <div
            role="dialog"
            aria-modal="true"
            aria-label="Source details"
            onClick={(event) =>
              event.stopPropagation()
            }
            className="w-full max-w-lg rounded-2xl border border-[#4D3A4D]/15 bg-[#F8EFEF] p-5 shadow-2xl"
          >
            <div className="flex items-start justify-between gap-4">
              <div>
                <p className="text-xs font-semibold uppercase tracking-wide text-[#BE5CA9]">
                  Source{" "}
                  {selectedSource.source_number ??
                    ""}
                </p>

                <h3 className="mt-1 text-lg font-bold text-[#4D3A4D]">
                  {selectedSource.section_title ||
                    selectedSource.document_name ||
                    "Retrieved document chunk"}
                </h3>

                {selectedSource.document_name && (
                  <p className="mt-1 text-xs text-[#4D3A4D]/60">
                    {
                      selectedSource.document_name
                    }
                  </p>
                )}
              </div>

              <button
                type="button"
                onClick={() =>
                  setSelectedSource(
                    null
                  )
                }
                className="flex size-8 items-center justify-center rounded-lg text-[#4D3A4D]/60 hover:bg-[#4D3A4D]/10"
                aria-label="Close source details"
              >
                <X className="size-4" />
              </button>
            </div>

            <dl className="mt-5 grid grid-cols-[110px_1fr] gap-x-4 gap-y-3 text-sm">
              <dt className="font-semibold text-[#4D3A4D]/65">
                Chunk
              </dt>

              <dd className="break-all text-[#4D3A4D]">
                {selectedSource.chunk_id ??
                  "Unknown"}
              </dd>

              <dt className="font-semibold text-[#4D3A4D]/65">
                Pages
              </dt>

              <dd className="text-[#4D3A4D]">
                {selectedSource.page_start ??
                  "Unknown"}

                {selectedSource.page_end !=
                  null &&
                selectedSource.page_end !==
                  selectedSource.page_start
                  ? `–${selectedSource.page_end}`
                  : ""}
              </dd>

              <dt className="font-semibold text-[#4D3A4D]/65">
                Type
              </dt>

              <dd className="text-[#4D3A4D]">
                {selectedSource.chunk_type ||
                  "Unknown"}
              </dd>

              {selectedSource.categories
                ?.length > 0 && (
                <>
                  <dt className="font-semibold text-[#4D3A4D]/65">
                    Categories
                  </dt>

                  <dd className="text-[#4D3A4D]">
                    {selectedSource.categories.join(
                      ", "
                    )}
                  </dd>
                </>
              )}
            </dl>

            {selectedSource.preview && (
              <div className="mt-5">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-[#4D3A4D]/55">
                  Retrieved text
                </p>

                <p className="max-h-56 overflow-y-auto rounded-xl border border-[#4D3A4D]/10 bg-white/55 p-4 text-sm leading-6 text-[#4D3A4D]">
                  {
                    selectedSource.preview
                  }
                </p>
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

export default MessageBubble;