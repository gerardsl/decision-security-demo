"use client";

import { catchError, type ErrorInfo } from "next/error";

function PanelFallback(props: { title: string }, info: ErrorInfo) {
  return (
    <div role="alert" className="notice notice-danger p-5 text-sm">
      <h2 className="title">{props.title} hit an unexpected error.</h2>
      <p className="mt-2 leading-6">The rest of the page is still available. You can try this panel again.</p>
      <button type="button" onClick={() => info.retry()} className="btn-primary mt-4">
        Try again
      </button>
    </div>
  );
}

export const PanelBoundary = catchError(PanelFallback);
