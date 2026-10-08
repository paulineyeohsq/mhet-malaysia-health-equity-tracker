import { Link } from "react-router-dom";

export default function NotFound() {
  return (
    <div className="mx-auto max-w-xl p-6 lg:p-10">
      <h1 className="text-xl font-semibold text-ink-primary">Page not found</h1>
      <p className="mt-2 text-sm text-ink-secondary">
        We couldn't find that page. It may have moved, or the link may be mistyped.
      </p>
      <Link to="/" className="mt-4 inline-block rounded-md bg-series-1 px-4 py-2 text-sm font-medium text-white">
        Back to Home
      </Link>
    </div>
  );
}
