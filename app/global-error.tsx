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
          background: "#f5f5f5",
          color: "#4e4e4e",
          fontFamily: '"Iowan Old Style", Palatino, "Palatino Linotype", "Times New Roman", serif',
        }}
      >
        <div
          aria-hidden="true"
          style={{
            position: "fixed",
            inset: 0,
            pointerEvents: "none",
            background:
              "radial-gradient(420px 420px at 90% 0%, rgba(167,229,211,0.85), transparent 70%), radial-gradient(380px 380px at 0% 40%, rgba(244,197,168,0.75), transparent 70%), radial-gradient(320px 320px at 70% 100%, rgba(200,184,224,0.7), transparent 70%)",
          }}
        />
        <main style={{ position: "relative", maxWidth: 560, margin: "0 auto", padding: "96px 24px" }}>
          <h1 style={{ fontWeight: 300, fontSize: 36, lineHeight: 1.17, letterSpacing: "-0.36px", color: "#0c0a09", margin: 0 }}>
            This page hit an unexpected error
          </h1>
          <p style={{ lineHeight: 1.5, letterSpacing: "0.16px", fontFamily: 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif' }}>
            The console could not keep rendering. Nothing on this screen is an automated security
            action.
          </p>
          {error.digest ? (
            <p style={{ fontFamily: "ui-monospace, monospace", fontSize: 12, color: "#777169" }}>
              Reference {error.digest}
            </p>
          ) : null}
          <button
            type="button"
            onClick={() => retry()}
            style={{
              marginTop: 28,
              background: "#292524",
              color: "#ffffff",
              border: 0,
              borderRadius: 9999,
              padding: "10px 20px",
              minHeight: 40,
              fontWeight: 500,
              fontSize: 15,
              fontFamily: 'Inter, ui-sans-serif, system-ui, "Segoe UI", sans-serif',
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </main>
      </body>
    </html>
  );
}
