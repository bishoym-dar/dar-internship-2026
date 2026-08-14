import {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";

import {
  ArrowLeft,
  ArrowRight,
  Check,
  CircleHelp,
  X,
} from "lucide-react";

const TOOLTIP_WIDTH = 360;
const SCREEN_PADDING = 16;
const TARGET_PADDING = 8;
const TOOLTIP_GAP = 14;

const TOUR_STEPS = [
  {
    id: "welcome",
    title: "Welcome to RAG Assistant",
    description:
      "This short guided tour will show you how to create chats, ask questions, verify sources, regenerate answers, and provide feedback.",
    selector: null,
  },
  {
    id: "help",
    title: "Guided Tour",
    description:
      "You can restart this tour at any time by selecting the Guided Tour button in the header.",
    selector: '[data-tour="help"]',
    highlightPadding: {
      top: 5,
      right: 5,
      bottom: 5,
      left: 5,
    },
  },
  {
    id: "sidebar-toggle",
    title: "Open or close the sidebar",
    description:
      "Use this button to show or hide your saved conversations.",
    selector:
      '[data-tour="sidebar-toggle"]',
  },
  {
    id: "sidebar",
    title: "Conversation sidebar",
    description:
      "The sidebar contains your saved chats, conversation search, and chat management controls.",
    selector: '[data-tour="sidebar"]',
    requiresSidebar: true,
    highlightPadding: {
      top: 0,
      right: 3,
      bottom: 0,
      left: 0,
    },
    scaleTarget: false,
  },
  {
    id: "new-chat",
    title: "Start a new chat",
    description:
      "Select New Chat whenever you want to begin a fresh conversation.",
    selector:
      '[data-tour="new-chat"]',
    requiresSidebar: true,
    highlightPadding: {
      top: 5,
      right: 6,
      bottom: 5,
      left: 6,
    },
  },
  {
    id: "conversation-search",
    title: "Search your chats",
    description:
      "Search saved conversations by words in their titles.",
    selector:
      '[data-tour="conversation-search"]',
    requiresSidebar: true,
  },
  {
    id: "conversation-actions",
    title: "Rename or delete a chat",
    description:
      "Hover over a saved conversation and select the three-dot button to rename or permanently delete it.",
    selector:
      '[data-tour="conversation-actions"]',
    requiresSidebar: true,
    optional: true,
  },
  {
    id: "message-input",
    title: "Ask a question",
    description:
      "Enter a question about the CIS Controls or any documents indexed by the RAG system.",
    selector:
      '[data-tour="message-input-area"]',
  },
  {
    id: "send-message",
    title: "Send your question",
    description:
      "Select this button or press Enter to submit your question. Use Shift + Enter to add a new line.",
    selector:
      '[data-tour="send-message"]',
  },
  {
    id: "citation",
    title: "Verify the sources",
    description:
      "Answers can include clickable citations. Open one to inspect its document, page numbers, chunk information, and retrieved text.",
    selector: '[data-tour="citation"]',
    optional: true,
  },
  {
    id: "response-actions",
    title: "Response controls",
    description:
      "This compact toolbar lets you copy an answer, regenerate it, rate it, and move between alternative versions.",
    selector:
      '[data-tour="response-actions"]',
    optional: true,
  },
  {
    id: "regenerate",
    title: "Regenerate an answer",
    description:
      "Generate an alternative answer while keeping the earlier answer in the version history.",
    selector:
      '[data-tour="regenerate-response"]',
    optional: true,
  },
  {
    id: "feedback",
    title: "Rate the response",
    description:
      "Use thumbs up for a helpful answer or thumbs down to explain what should be improved.",
    selector:
      '[data-tour="feedback-up"]',
    optional: true,
  },
  {
    id: "versions",
    title: "Compare answer versions",
    description:
      "After regenerating an answer, use these controls to move between versions. Each version keeps its own answer, sources, timing, and feedback.",
    selector:
      '[data-tour="version-navigation"]',
    optional: true,
  },
  {
    id: "complete",
    title: "You are ready",
    description:
      "You now know the main features of the RAG Assistant. You can restart this tour at any time from the header.",
    selector: null,
  },
];

function clamp(value, minimum, maximum) {
  return Math.min(
    Math.max(value, minimum),
    maximum
  );
}

function expandBorderRadius(
  borderRadius,
  padding
) {
  if (!borderRadius) {
    return `${padding}px`;
  }

  const radiusParts =
    borderRadius.split(/\s+/);

  const expandedParts =
    radiusParts.map((part) => {
      const numericRadius =
        Number.parseFloat(part);

      if (Number.isNaN(numericRadius)) {
        return part;
      }

      if (numericRadius >= 999) {
        return "9999px";
      }

      return `${
        numericRadius + padding
      }px`;
    });

  return expandedParts.join(" ");
}


function getTargetPadding(step) {
  const configuredPadding =
    step?.highlightPadding;

  if (!configuredPadding) {
    return {
      top: TARGET_PADDING,
      right: TARGET_PADDING,
      bottom: TARGET_PADDING,
      left: TARGET_PADDING,
    };
  }

  return {
    top:
      configuredPadding.top ??
      TARGET_PADDING,
    right:
      configuredPadding.right ??
      TARGET_PADDING,
    bottom:
      configuredPadding.bottom ??
      TARGET_PADDING,
    left:
      configuredPadding.left ??
      TARGET_PADDING,
  };
}


function getTargetRectangle(
  element,
  step
) {
  if (!element) {
    return null;
  }

  const rectangle =
    element.getBoundingClientRect();

  if (
    rectangle.width <= 0 ||
    rectangle.height <= 0
  ) {
    return null;
  }

  const computedStyle =
    window.getComputedStyle(element);

  const padding =
    getTargetPadding(step);

  /*
   * Keep the padding symmetrical around the actual element.
   * Do not clamp to SCREEN_PADDING because clamping shifts targets
   * near the viewport edges away from their real visual center.
   */
  const top =
    rectangle.top - padding.top;

  const left =
    rectangle.left - padding.left;

  const right =
    rectangle.right + padding.right;

  const bottom =
    rectangle.bottom + padding.bottom;

  const radiusPadding = Math.max(
    padding.top,
    padding.right,
    padding.bottom,
    padding.left
  );

  return {
    top,
    left,
    right,
    bottom,
    width:
      rectangle.width +
      padding.left +
      padding.right,
    height:
      rectangle.height +
      padding.top +
      padding.bottom,
    borderRadius:
      expandBorderRadius(
        computedStyle.borderRadius,
        radiusPadding
      ),
  };
}


function calculateTooltipPosition(
  targetRectangle
) {
  if (!targetRectangle) {
    return {
      top: "50%",
      left: "50%",
      transform:
        "translate(-50%, -50%)",
    };
  }

  const estimatedTooltipHeight = 280;

  const spaceBelow =
    window.innerHeight -
    targetRectangle.bottom;

  const spaceAbove =
    targetRectangle.top;

  const placeBelow =
    spaceBelow >=
      estimatedTooltipHeight +
        TOOLTIP_GAP ||
    spaceBelow >= spaceAbove;

  const numericTop = placeBelow
    ? targetRectangle.bottom +
      TOOLTIP_GAP
    : targetRectangle.top -
      estimatedTooltipHeight -
      TOOLTIP_GAP;

  const centeredLeft =
    targetRectangle.left +
    targetRectangle.width / 2 -
    TOOLTIP_WIDTH / 2;

  const maximumLeft =
    Math.max(
      SCREEN_PADDING,
      window.innerWidth -
        TOOLTIP_WIDTH -
        SCREEN_PADDING
    );

  return {
    top: clamp(
      numericTop,
      SCREEN_PADDING,
      Math.max(
        SCREEN_PADDING,
        window.innerHeight -
          estimatedTooltipHeight -
          SCREEN_PADDING
      )
    ),
    left: clamp(
      centeredLeft,
      SCREEN_PADDING,
      maximumLeft
    ),
    transform: "none",
  };
}

function GuidedTour({
  isOpen,
  onClose,
  onEnsureSidebarOpen,
}) {
  const [
    currentStepIndex,
    setCurrentStepIndex,
  ] = useState(0);

  const [
    targetRectangle,
    setTargetRectangle,
  ] = useState(null);

  const [
    targetElement,
    setTargetElement,
  ] = useState(null);

  const highlightedElementRef =
    useRef(null);

  const originalTargetStylesRef =
    useRef(null);

  const restoreHighlightedElement =
    useCallback(() => {
      const element =
        highlightedElementRef.current;

      const originalStyles =
        originalTargetStylesRef.current;

      if (element && originalStyles) {
        element.style.filter =
          originalStyles.filter;

        element.style.transform =
          originalStyles.transform;

        element.style.transition =
          originalStyles.transition;

        element.style.transformOrigin =
          originalStyles.transformOrigin;

        element.style.willChange =
          originalStyles.willChange;
      }

      highlightedElementRef.current =
        null;

      originalTargetStylesRef.current =
        null;
    }, []);

  const currentStep =
    TOUR_STEPS[currentStepIndex];

  const isFirstStep =
    currentStepIndex === 0;

  const isLastStep =
    currentStepIndex ===
    TOUR_STEPS.length - 1;

  const tooltipPosition = useMemo(
    () =>
      calculateTooltipPosition(
        targetRectangle
      ),
    [targetRectangle]
  );

  const updateTargetRectangle =
    useCallback(() => {
      if (!targetElement) {
        setTargetRectangle(null);
        return;
      }

      setTargetRectangle(
        getTargetRectangle(
          targetElement,
          currentStep
        )
      );
    }, [
      currentStep,
      targetElement,
    ]);

  const findAvailableStep =
    useCallback(
      (
        startingIndex,
        direction = 1
      ) => {
        let candidateIndex =
          startingIndex;

        while (
          candidateIndex >= 0 &&
          candidateIndex <
            TOUR_STEPS.length
        ) {
          const candidate =
            TOUR_STEPS[
              candidateIndex
            ];

          if (!candidate.selector) {
            return candidateIndex;
          }

          const candidateElement =
            document.querySelector(
              candidate.selector
            );

          if (
            candidateElement ||
            !candidate.optional
          ) {
            return candidateIndex;
          }

          candidateIndex += direction;
        }

        return direction > 0
          ? TOUR_STEPS.length - 1
          : 0;
      },
      []
    );

  const goToNextStep =
    useCallback(() => {
      if (isLastStep) {
        onClose?.({
          completed: true,
        });

        return;
      }

      const nextIndex =
        findAvailableStep(
          currentStepIndex + 1,
          1
        );

      setCurrentStepIndex(nextIndex);
    }, [
      currentStepIndex,
      findAvailableStep,
      isLastStep,
      onClose,
    ]);

  const goToPreviousStep =
    useCallback(() => {
      if (isFirstStep) {
        return;
      }

      const previousIndex =
        findAvailableStep(
          currentStepIndex - 1,
          -1
        );

      setCurrentStepIndex(
        previousIndex
      );
    }, [
      currentStepIndex,
      findAvailableStep,
      isFirstStep,
    ]);

  function skipTour() {
    onClose?.({
      completed: true,
    });
  }

  useEffect(() => {
    restoreHighlightedElement();

    if (!isOpen) {
      setCurrentStepIndex(0);
      setTargetElement(null);
      setTargetRectangle(null);
      return undefined;
    }

    if (currentStep?.requiresSidebar) {
      onEnsureSidebarOpen?.();
    }

    let animationTimeoutId = null;

    const timeoutId =
      window.setTimeout(() => {
        if (!currentStep?.selector) {
          setTargetElement(null);
          setTargetRectangle(null);
          return;
        }

        const element =
          document.querySelector(
            currentStep.selector
          );

        if (!element) {
          if (currentStep.optional) {
            const nextIndex =
              findAvailableStep(
                currentStepIndex + 1,
                1
              );

            setCurrentStepIndex(
              nextIndex
            );
          } else {
            setTargetElement(null);
            setTargetRectangle(null);
          }

          return;
        }

        element.scrollIntoView({
          behavior: "smooth",
          block: "center",
          inline: "nearest",
        });

        animationTimeoutId =
          window.setTimeout(() => {
            originalTargetStylesRef.current = {
              filter:
                element.style.filter,
              transform:
                element.style.transform,
              transition:
                element.style.transition,
              transformOrigin:
                element.style
                  .transformOrigin,
              willChange:
                element.style.willChange,
            };

            highlightedElementRef.current =
              element;

            element.style.transition =
              "transform 250ms ease, filter 250ms ease";

            element.style.transformOrigin =
              "center";

            const shouldScaleTarget =
              currentStep?.scaleTarget !==
              false;

            element.style.willChange =
              shouldScaleTarget
                ? "transform, filter"
                : "filter";

            element.style.filter =
              "brightness(1.08)";

            element.style.transform =
              shouldScaleTarget
                ? "scale(1.02)"
                : originalTargetStylesRef
                    .current.transform;

            /*
             * Measure on the next two animation frames so the browser
             * finishes applying any visual target styling first.
             */
            window.requestAnimationFrame(() => {
              window.requestAnimationFrame(() => {
                setTargetElement(element);

                setTargetRectangle(
                  getTargetRectangle(
                    element,
                    currentStep
                  )
                );
              });
            });
          }, 280);
      },
      currentStep?.requiresSidebar
        ? 350
        : 100
      );

    return () => {
      window.clearTimeout(
        timeoutId
      );

      if (
        animationTimeoutId !== null
      ) {
        window.clearTimeout(
          animationTimeoutId
        );
      }

      restoreHighlightedElement();
    };
  }, [
    currentStep,
    currentStepIndex,
    findAvailableStep,
    isOpen,
    onEnsureSidebarOpen,
    restoreHighlightedElement,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleViewportChange() {
      updateTargetRectangle();
    }

    window.addEventListener(
      "resize",
      handleViewportChange
    );

    window.addEventListener(
      "scroll",
      handleViewportChange,
      true
    );

    return () => {
      window.removeEventListener(
        "resize",
        handleViewportChange
      );

      window.removeEventListener(
        "scroll",
        handleViewportChange,
        true
      );
    };
  }, [
    isOpen,
    updateTargetRectangle,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    function handleKeyDown(event) {
      if (event.key === "Escape") {
        skipTour();
        return;
      }

      if (
        event.key === "ArrowRight" ||
        event.key === "Enter"
      ) {
        event.preventDefault();
        goToNextStep();
        return;
      }

      if (
        event.key === "ArrowLeft"
      ) {
        event.preventDefault();
        goToPreviousStep();
      }
    }

    document.addEventListener(
      "keydown",
      handleKeyDown
    );

    return () => {
      document.removeEventListener(
        "keydown",
        handleKeyDown
      );
    };
  }, [
    goToNextStep,
    goToPreviousStep,
    isOpen,
  ]);

  useEffect(() => {
    if (!isOpen) {
      return undefined;
    }

    const previousOverflow =
      document.body.style.overflow;

    document.body.style.overflow =
      "hidden";

    return () => {
      document.body.style.overflow =
        previousOverflow;
    };
  }, [isOpen]);

  if (!isOpen || !currentStep) {
    return null;
  }

  const progressPercentage =
    ((currentStepIndex + 1) /
      TOUR_STEPS.length) *
    100;

  return (
    <div
      className="fixed inset-0 z-[2147483000]"
      aria-live="polite"
    >
      {!targetRectangle && (
        <div
          className="fixed inset-0 bg-black/55"
          aria-hidden="true"
        />
      )}

      {targetRectangle && (
        <>
          {/*
           * A single rounded cutout creates the dim overlay while
           * preserving the highlighted control's exact shape.
           */}
          <div
            className="pointer-events-none fixed transition-all duration-300"
            style={{
              top:
                targetRectangle.top,
              left:
                targetRectangle.left,
              width:
                targetRectangle.width,
              height:
                targetRectangle.height,
              borderRadius:
                targetRectangle.borderRadius,
              boxShadow:
                "0 0 0 9999px rgba(0,0,0,0.55)",
              zIndex: 2147483600,
            }}
            aria-hidden="true"
          />

          {/* Purple border and glow matching the target shape. */}
          <div
            className="pointer-events-none fixed border-2 border-[#F3B8E7] transition-all duration-300"
            style={{
              top:
                targetRectangle.top,
              left:
                targetRectangle.left,
              width:
                targetRectangle.width,
              height:
                targetRectangle.height,
              borderRadius:
                targetRectangle.borderRadius,
              zIndex: 2147483645,
              boxShadow:
                "0 0 0 4px rgba(190,92,169,0.25), 0 0 28px rgba(190,92,169,0.85)",
            }}
            aria-hidden="true"
          />
        </>
      )}

      <section
        role="dialog"
        aria-modal="true"
        aria-labelledby="guided-tour-title"
        aria-describedby="guided-tour-description"
        className="fixed w-[calc(100vw-2rem)] max-w-[360px] overflow-hidden rounded-2xl border border-[#4D3A4D]/15 bg-[#FFF8F8] shadow-2xl"
        style={{
          top: tooltipPosition.top,
          left: tooltipPosition.left,
          transform:
            tooltipPosition.transform,
          zIndex: 2147483647,
        }}
      >
        <div className="h-1 bg-[#4D3A4D]/10">
          <div
            className="h-full bg-[#BE5CA9] transition-[width] duration-300"
            style={{
              width: `${progressPercentage}%`,
            }}
          />
        </div>

        <div className="p-5">
          <div className="flex items-start justify-between gap-4">
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-[#BE5CA9]/15 text-[#BE5CA9]">
                {isLastStep ? (
                  <Check className="size-5" />
                ) : (
                  <CircleHelp className="size-5" />
                )}
              </div>

              <div className="min-w-0">
                <p className="text-xs font-semibold uppercase tracking-wider text-[#BE5CA9]">
                  Step{" "}
                  {currentStepIndex + 1} of{" "}
                  {TOUR_STEPS.length}
                </p>

                <h2
                  id="guided-tour-title"
                  className="mt-1 text-lg font-bold leading-snug text-[#4D3A4D]"
                >
                  {currentStep.title}
                </h2>
              </div>
            </div>

            <button
              type="button"
              onClick={skipTour}
              aria-label="Skip guided tour"
              title="Skip tour"
              className="flex size-8 shrink-0 items-center justify-center rounded-lg text-[#4D3A4D]/55 transition hover:bg-[#4D3A4D]/10 hover:text-[#4D3A4D]"
            >
              <X className="size-4" />
            </button>
          </div>

          <p
            id="guided-tour-description"
            className="mt-4 text-sm leading-6 text-[#4D3A4D]/75"
          >
            {currentStep.description}
          </p>

          <div className="mt-5 flex items-center justify-between gap-3">
            <button
              type="button"
              onClick={skipTour}
              className="rounded-lg px-2 py-2 text-sm font-medium text-[#4D3A4D]/55 transition hover:bg-[#4D3A4D]/8 hover:text-[#4D3A4D]"
            >
              Skip tour
            </button>

            <div className="flex items-center gap-2">
              {!isFirstStep && (
                <button
                  type="button"
                  onClick={
                    goToPreviousStep
                  }
                  className="flex h-9 items-center gap-1.5 rounded-lg border border-[#4D3A4D]/15 bg-white/60 px-3 text-sm font-medium text-[#4D3A4D] transition hover:border-[#BE5CA9]/50 hover:bg-white"
                >
                  <ArrowLeft className="size-3.5" />
                  Back
                </button>
              )}

              <button
                type="button"
                onClick={goToNextStep}
                className="flex h-9 items-center gap-1.5 rounded-lg bg-[#BE5CA9] px-4 text-sm font-semibold text-white transition hover:bg-[#A94E96]"
              >
                {isLastStep ? (
                  <>
                    Finish
                    <Check className="size-3.5" />
                  </>
                ) : (
                  <>
                    {isFirstStep
                      ? "Start tour"
                      : "Next"}
                    <ArrowRight className="size-3.5" />
                  </>
                )}
              </button>
            </div>
          </div>
        </div>
      </section>
    </div>
  );
}

export default GuidedTour;