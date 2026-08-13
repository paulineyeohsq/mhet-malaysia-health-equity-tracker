import { NavLink, Outlet } from "react-router-dom";
import AskMhet from "./AskMhet";
import ChatPanel from "./ChatPanel";

interface NavItem {
  to: string;
  label: string;
  end?: boolean;
}
interface NavSection {
  heading: string | null;
  items: NavItem[];
}

const NAV_SECTIONS: NavSection[] = [
  { heading: null, items: [{ to: "/", label: "Home", end: true }] },
  { heading: "WHO", items: [{ to: "/population", label: "Population Explorer" }] },
  { heading: "WHERE", items: [{ to: "/map", label: "Geographic Explorer" }] },
  {
    heading: "WHY",
    items: [
      { to: "/determinants", label: "Determinants Explorer" },
      { to: "/socioeconomic", label: "Socioeconomic Inequality" },
      { to: "/health-outcomes", label: "Health Outcomes" },
      { to: "/healthcare-access", label: "Healthcare Access" },
    ],
  },
  { heading: "Equity Gap", items: [{ to: "/analytics", label: "Equity Gap Analysis" }] },
  {
    heading: "Priority & Opportunity",
    items: [
      { to: "/priority-areas", label: "Priority Areas" },
      { to: "/research-opportunities", label: "Research Opportunities" },
    ],
  },
  { heading: "Researcher Tools", items: [{ to: "/explorer", label: "Data Explorer" }] },
  { heading: "About", items: [{ to: "/methodology", label: "Methodology" }] },
];

export default function Layout() {
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-seq-600 focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      {/* Sidebar */}
      <header className="lg:w-64 lg:min-h-screen border-b lg:border-b-0 lg:border-r border-line-grid bg-surface">
        <div className="px-5 py-5 border-b border-line-grid">
          <NavLink to="/" className="block">
            <div className="text-[13px] font-semibold tracking-wide text-series-1 uppercase">
              Malaysia
            </div>
            <div className="text-lg font-semibold text-ink-primary leading-tight">
              Health Equity Observatory
            </div>
            <div className="text-[11px] font-medium tracking-wide text-ink-muted">MY-HEO</div>
          </NavLink>
        </div>
        <nav aria-label="Primary" className="px-2 py-3">
          {NAV_SECTIONS.map((section, i) => (
            <div key={section.heading ?? `section-${i}`} className={i > 0 ? "mt-3" : undefined}>
              {section.heading && (
                <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
                  {section.heading}
                </div>
              )}
              <ul className="flex lg:flex-col flex-wrap gap-1">
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavLink
                      to={item.to}
                      end={item.end}
                      className={({ isActive }) =>
                        `block rounded-md px-3 py-2 text-sm transition-colors ${
                          isActive
                            ? "bg-seq-100 text-series-1 font-medium"
                            : "text-ink-secondary hover:bg-plane hover:text-ink-primary"
                        }`
                      }
                    >
                      {item.label}
                    </NavLink>
                  </li>
                ))}
              </ul>
            </div>
          ))}
        </nav>
        <div className="hidden lg:block px-5 py-4 mt-auto text-xs text-ink-muted border-t border-line-grid">
          Data: data.gov.my / DOSM / MOH
          <br />
          Not for clinical or individual-level decision-making.
        </div>
      </header>

      {/* Main content */}
      <main id="main-content" className="flex-1 min-w-0">
        <AskMhet />
        <Outlet />
        <ChatPanel />
      </main>
    </div>
  );
}
