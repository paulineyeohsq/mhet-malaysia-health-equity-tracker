import { Suspense, useEffect, useRef, useState } from "react";
import { NavLink, Outlet, useLocation } from "react-router-dom";
import AskMhet from "./AskMhet";
import ChatPanel from "./ChatPanel";
import ErrorBoundary from "./ErrorBoundary";
import { ChatProvider } from "../lib/chatContext";

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
  {
    heading: "Who and where",
    items: [
      { to: "/population", label: "Population Explorer" },
      { to: "/map", label: "Geographic Explorer" },
    ],
  },
  {
    heading: "Topics and patterns",
    items: [
      { to: "/topics", label: "Health Topics" },
      { to: "/patterns", label: "Patterns & Inequality" },
      { to: "/determinants", label: "Determinants Explorer" },
    ],
  },
  {
    heading: "Equity Gap",
    items: [
      { to: "/analytics", label: "Equity Gap Analysis" },
      { to: "/state-matrix", label: "State Equity Gap Matrix" },
    ],
  },
  {
    heading: "Priority & Opportunity",
    items: [
      { to: "/priority-areas", label: "Priority Areas" },
      { to: "/research-opportunities", label: "Research Opportunities" },
    ],
  },
  {
    heading: "Researcher Tools",
    items: [
      { to: "/explorer", label: "Data Explorer" },
      { to: "/data-gaps", label: "Data Gaps" },
    ],
  },
  { heading: "About", items: [{ to: "/methodology", label: "Methodology" }] },
];

const LOGO_ALT = "Malaysia Health Equity Observatory (MY-HEO)";

function NavList() {
  return (
    <nav aria-label="Primary" className="px-2 py-3">
      {NAV_SECTIONS.map((section, i) => (
        <div key={section.heading ?? `section-${i}`} className={i > 0 ? "mt-3" : undefined}>
          {section.heading && (
            <div className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-ink-muted">
              {section.heading}
            </div>
          )}
          <ul className="flex flex-col gap-1">
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
  );
}

/**
 * Phone/tablet top bar (below the lg breakpoint): small logo + a menu button that opens the same
 * navigation as the desktop sidebar. The menu closes on navigation (its open state is tied to the
 * pathname it was opened on, so no effect is needed), on Escape (focus returns to the button) and
 * on a click outside it.
 */
function MobileBar() {
  const { pathname } = useLocation();
  const [openAt, setOpenAt] = useState<string | null>(null);
  const open = openAt === pathname;
  const buttonRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setOpenAt(null);
        buttonRef.current?.focus();
      }
    }
    function onPointer(e: MouseEvent) {
      const target = e.target as Node;
      if (!panelRef.current?.contains(target) && !buttonRef.current?.contains(target)) setOpenAt(null);
    }
    document.addEventListener("keydown", onKey);
    document.addEventListener("mousedown", onPointer);
    return () => {
      document.removeEventListener("keydown", onKey);
      document.removeEventListener("mousedown", onPointer);
    };
  }, [open]);

  return (
    <div className="sticky top-0 z-40 border-b border-line-grid bg-surface lg:hidden">
      <div className="flex h-14 items-center justify-between px-4">
        <NavLink to="/" className="flex items-center gap-2" aria-label={`${LOGO_ALT} — home`}>
          <img src={`${import.meta.env.BASE_URL}logo.png`} alt="" className="h-9 w-9 object-contain" />
          <span className="text-sm font-semibold text-ink-primary">MY-HEO</span>
        </NavLink>
        <button
          ref={buttonRef}
          type="button"
          aria-expanded={open}
          aria-controls="mobile-menu"
          onClick={() => setOpenAt(open ? null : pathname)}
          className="flex h-10 items-center gap-2 rounded-md border border-line-axis px-3 text-sm font-medium text-ink-primary"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-5 w-5" aria-hidden="true">
            {open ? (
              <path strokeLinecap="round" strokeLinejoin="round" d="M6 18 18 6M6 6l12 12" />
            ) : (
              <path strokeLinecap="round" strokeLinejoin="round" d="M4 7h16M4 12h16M4 17h16" />
            )}
          </svg>
          Menu
        </button>
      </div>
      <div
        id="mobile-menu"
        ref={panelRef}
        hidden={!open}
        className="max-h-[calc(100vh-3.5rem)] overflow-y-auto border-t border-line-grid bg-surface"
      >
        <NavList />
      </div>
    </div>
  );
}

export default function Layout() {
  const { pathname } = useLocation();
  return (
    <div className="min-h-screen flex flex-col lg:flex-row">
      <a
        href="#main-content"
        className="sr-only focus:not-sr-only focus:absolute focus:z-50 focus:m-2 focus:rounded focus:bg-seq-600 focus:px-3 focus:py-2 focus:text-white"
      >
        Skip to main content
      </a>

      <MobileBar />

      {/* Desktop sidebar */}
      <header className="hidden border-line-grid bg-surface lg:flex lg:min-h-screen lg:w-64 lg:flex-col lg:border-r">
        <div className="px-5 py-5 border-b border-line-grid">
          <NavLink to="/" className="block">
            <img
              src={`${import.meta.env.BASE_URL}logo.png`}
              alt={LOGO_ALT}
              className="h-auto w-full max-w-[180px]"
            />
          </NavLink>
        </div>
        <NavList />
        <div className="px-5 py-4 mt-auto text-xs text-ink-muted border-t border-line-grid">
          Data: data.gov.my / DOSM / MOH
          <br />
          Not for clinical or individual-level decision-making.
        </div>
      </header>

      {/* Main content */}
      <main id="main-content" className="flex-1 min-w-0">
        <ChatProvider>
          <AskMhet />
          {/* Pages are code-split (React.lazy in App.tsx); the nav stays put while one loads. The boundary is
              keyed by route so navigating away from a crashed page recovers without a reload. */}
          <ErrorBoundary key={pathname}>
            <Suspense fallback={<div className="p-10 text-sm text-ink-muted">Loading…</div>}>
              <Outlet />
            </Suspense>
          </ErrorBoundary>
          <ChatPanel />
        </ChatProvider>
      </main>
    </div>
  );
}
