import React from "react";

interface Props { children: React.ReactNode; }
interface State { hasError: boolean; }

export class ErrorBoundary extends React.Component<Props, State> {
  state: State = { hasError: false };

  static getDerivedStateFromError(): State {
    return { hasError: true };
  }

  render() {
    if (this.state.hasError) {
      return (
        <div style={{ display: "flex", height: "100vh", flexDirection: "column", alignItems: "center", justifyContent: "center", gap: "16px", background: "#0b0d10", color: "#f3f4f6" }}>
          <p style={{ fontSize: "16px", fontWeight: 500, margin: 0 }}>Something went wrong.</p>
          <button
            style={{ padding: "8px 20px", borderRadius: "8px", background: "#243141", color: "#fff", border: "none", cursor: "pointer", fontSize: "14px" }}
            onClick={() => { this.setState({ hasError: false }); window.location.reload(); }}
          >
            Refresh page
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
