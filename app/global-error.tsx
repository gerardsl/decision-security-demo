"use client";

export default function GlobalError({
  error,
  retry,
}: {
  error: Error & { digest?: string };
  retry: () => void;
}) {
  return (
    <html lang="en">
      <body
        style={{
          margin: 0,
          minHeight: "100vh",
          background: "#070d18",
          color: "#e7eefc",
          fontFamily: "Segoe UI, sans-serif",
        }}
      >
        <main style={{ maxWidth: 520, margin: "0 auto", padding: "64px 24px" }}>
          <h1 style={{ fontSize: 28, marginBottom: 12 }}>This page hit an unexpected error</h1>
          <p style={{ lineHeight: 1.6 }}>
            The console could not keep rendering. Nothing on this screen is an automated security
            action.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12 }}>
              Reference {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 20,
              background: "#67e8f9",
              color: "#082f49",
              border: 0,
              borderRadius: 6,
              padding: "8px 14px",
              fontWeight: 700,
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
