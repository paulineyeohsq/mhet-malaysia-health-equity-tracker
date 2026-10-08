import { Component, type ErrorInfo, type ReactNode } from "react";

/**
 * Catches render errors (and failed lazy-chunk loads, e.g. right after a deploy replaced the old
 * bundles) in a routed page, so the nav and the rest of the shell stay usable.
 */
export default class ErrorBoundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.error("Page crashed:", error, info.componentStack);
  }

  render() {
    if (!this.state.failed) return this.props.children;
    return (
      <div role="alert" className="mx-auto max-w-xl p-6 lg:p-10">
        <h1 className="text-xl font-semibold text-ink-primary">This page couldn't load</h1>
        <p className="mt-2 text-sm text-ink-secondary">
          Something went wrong while showing this page. Reloading usually fixes it, especially if the site was just
          updated. The data itself is unaffected.
        </p>
        <div className="mt-4 flex flex-wrap gap-3">
          <button
            type="button"
            onClick={() => window.location.reload()}
            className="rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white"
          >
            Reload page
          </button>
          <a
            href="#/"
            className="rounded-md border border-line-axis px-4 py-2 text-sm font-medium text-ink-primary"
          >
            Go to Home
          </a>
        </div>
      </div>
    );
  }
}
