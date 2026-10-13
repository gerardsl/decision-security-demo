"use client";

import { catchError, type ErrorInfo } from "next/error";

function PanelFallback(props: { title: string }, info: ErrorInfo) {
  return (
    <div role="alert" className="rounded-xl border border-rose-400/30 bg-rose-500/10 p-4 text-sm text-rose-50">
      <h2 className="text-base font-semibold">{props.title} hit an unexpected error.</h2>
      <p className="mt-2 leading-6">The rest of the page is still available. You can try this panel again.</p>
      <button
        type="button"
        onClick={() => info.retry()}
        className="mt-3 rounded-md bg-rose-100 px-3 py-1.5 text-sm font-semibold text-rose-950 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-rose-50"
      >
        Try again
      </button>
    </div>
  );
}

export const PanelBoundary = catchError(PanelFallback);
