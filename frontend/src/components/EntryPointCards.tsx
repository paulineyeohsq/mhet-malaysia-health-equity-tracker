import { Link } from "react-router-dom";

interface EntryPoint {
  question: string;
  label: string;
  description: string;
  to: string;
}

const ENTRY_POINTS: EntryPoint[] = [
  {
    question: "WHO?",
    label: "Explore Populations",
    description: "Population structure by sex, age, ethnicity and geography.",
    to: "/population",
  },
  {
    question: "WHERE?",
    label: "Explore Geography",
    description: "Interactive state/district maps, rankings and comparisons.",
    to: "/map",
  },
  {
    question: "WHY?",
    label: "Explore Determinants",
    description: "Real socioeconomic and healthcare-access associations, never causal claims.",
    to: "/determinants",
  },
  {
    question: "WHAT NEXT?",
    label: "Identify Research Opportunities",
    description: "Priority areas, suggested research questions and technology directions.",
    to: "/priority-areas",
  },
];

export default function EntryPointCards() {
  return (
    <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-4">
      {ENTRY_POINTS.map((ep) => (
        <Link
          key={ep.to}
          to={ep.to}
          className="rounded-lg border border-line-grid bg-surface p-4 transition-colors hover:border-series-1 hover:bg-plane"
        >
          <div className="text-xs font-semibold uppercase tracking-wide text-series-1">{ep.question}</div>
          <div className="mt-1 text-sm font-semibold text-ink-primary">{ep.label}</div>
          <p className="mt-1.5 text-xs leading-relaxed text-ink-secondary">{ep.description}</p>
        </Link>
      ))}
    </div>
  );
}
