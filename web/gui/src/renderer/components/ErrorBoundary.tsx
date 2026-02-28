import { Component, type ErrorInfo, type ReactNode } from "react";

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
}

interface State {
  hasError: boolean;
  error: Error | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): State {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo): void {
    console.error("ErrorBoundary caught an error:", error, errorInfo);
  }

  render(): ReactNode {
    if (this.state.hasError) {
      if (this.props.fallback) {
        return this.props.fallback;
      }
      return (
        <div style={{ padding: "24px", textAlign: "center" }}>
          <h2 style={{ color: "var(--color-error-500, #F87171)", margin: "0 0 8px" }}>
            Something went wrong
          </h2>
          <p style={{ color: "var(--color-on-surface-secondary)", margin: "0 0 16px" }}>
            {this.state.error?.message ?? "An unexpected error occurred."}
          </p>
          <button
            onClick={() => this.setState({ hasError: false, error: null })}
            style={{
              padding: "8px 16px",
              borderRadius: "6px",
              border: "1px solid var(--color-border-subtle, rgba(255,255,255,0.12))",
              background: "var(--color-surface-raised, #1A1122)",
              color: "var(--color-on-surface, #F7F0FF)",
              cursor: "pointer",
            }}
          >
            Try again
          </button>
        </div>
      );
    }
    return this.props.children;
  }
}
