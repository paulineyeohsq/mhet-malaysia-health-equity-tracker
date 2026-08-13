import { NavLink, Outlet } from "react-router-dom";
import AskMhet from "./AskMhet";
import ChatPanel from "./ChatPanel";

const NAV = [
  { to: "/", label: "Overview", end: true },
  { to: "/map", label: "Health Equity Map" },
  { to: "/socioeconomic", label: "Socioeconomic Inequality" },
  { to: "/health-outcomes", label: "Health Outcomes" },
  { to: "/healthcare-access", label: "Healthcare Access" },
  { to: "/population", label: "Population Equity" },
  { to: "/analytics", label: "Inequality Analytics" },
  { to: "/explorer", label: "Data Explorer" },
  { to: "/methodology", label: "Methodology" },
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
              Health Equity Tracker
            </div>
          </NavLink>
        </div>
        <nav aria-label="Primary" className="px-2 py-3">
          <ul className="flex lg:flex-col flex-wrap gap-1">
            {NAV.map((item) => (
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
