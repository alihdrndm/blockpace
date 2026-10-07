"use client";

import { buttonClass, ErrorPanel } from "../components/ui";

// Last-resort boundary: anything a page did not already turn into an inline error.
export default function PageError({
  reset,
}: {
  error: Error;
  reset: () => void;
}) {
  return (
    <div className="space-y-4">
      <ErrorPanel
        error={{
          title: "This page could not be shown",
          detail: "Something failed while loading it. Try again in a moment.",
        }}
      />
      <button type="button" className={buttonClass} onClick={reset}>
        Try again
      </button>
    </div>
  );
}
