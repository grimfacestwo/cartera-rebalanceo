"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { parseCochesState, pendingAlerts, type Alerts } from "@/lib/coches";
import { parseState, BANK_IDS, currentMonthKey, daysRemaining, effectiveAmount, expenseAppliesToMonth, type Expense } from "@/lib/state";
import { parseUiPrefs } from "@/lib/ui-prefs";
import styles from "./layout.module.css";

const SECTIONS = [
  {
    slug: "/",
    label: "Finanzas",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <line x1="12" y1="1" x2="12" y2="23" /><path d="M17 5H9.5a3.5 3.5 0 0 0 0 7h5a3.5 3.5 0 0 1 0 7H6" />
      </svg>
    ),
  },
  {
    slug: "/hogar",
    label: "Hogar",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M3 9l9-7 9 7" /><path d="M9 22V12h6v10" /><path d="M5 10v10a1 1 0 0 0 1 1h3m10-11v10a1 1 0 0 1-1 1h-3" />
      </svg>
    ),
  },
  {
    slug: "/coches",
    label: "Coches",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M5 17h14M5 17a2 2 0 0 1-2-2V9a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2v6a2 2 0 0 1-2 2M5 17l-1 4h16l-1-4" /><circle cx="7.5" cy="14.5" r="1.5" /><circle cx="16.5" cy="14.5" r="1.5" />
      </svg>
    ),
  },
  {
    slug: "/lectura",
    label: "Lectura",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M2 3h6a4 4 0 0 1 4 4v14a3 3 0 0 0-3-3H2z" /><path d="M22 3h-6a4 4 0 0 0-4 4v14a3 3 0 0 1 3-3h7z" />
      </svg>
    ),
  },
  {
    slug: "/planificacion",
    label: "Planificación",
    icon: (
      <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d="M9 11l3 3L22 4" /><path d="M21 12v7a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11" />
      </svg>
    ),
  },
];

const currencySidebar = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(false);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [darkMode, setDarkMode] = useState(false);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [disponible, setDisponible] = useState<number | null>(null);
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/section/ui-prefs");
        if (!res.ok) throw new Error("no data");
        const { data } = (await res.json()) as { data?: unknown };
        const prefs = parseUiPrefs(data);
        if (!cancelled) {
          setCollapsed(prefs.sidebar);
          setDarkMode(prefs.dark);
        }
      } catch {
        /* mantener defaults */
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/section/coches");
        if (!res.ok) throw new Error("no data");
        const data = (await res.json()) as { data?: unknown };
        const state = parseCochesState(data.data);
        if (!cancelled) setAlerts(pendingAlerts(state));
      } catch {
        if (!cancelled) setAlerts(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch("/api/state");
        if (!res.ok) throw new Error("no data");
        const { state: raw } = (await res.json()) as { state?: unknown };
        const state = parseState(raw);
        const curKey = currentMonthKey();
        const active = state.months[curKey] ?? { banks: {} as Record<string, string>, expenses: [], fixed: [] };
        const days = daysRemaining(curKey);
        const allExp: Expense[] = [...(active.fixed ?? []), ...active.expenses];
        const bankTotal = BANK_IDS.reduce((s, id) => s + (Number.parseFloat(active.banks[id]) || 0), 0);
        const pendientes = allExp
          .filter((e) => !e.paid && expenseAppliesToMonth(e, curKey))
          .reduce((s, e) => s + effectiveAmount(e, days), 0);
        if (!cancelled) setDisponible(bankTotal - pendientes);
      } catch {
        if (!cancelled) setDisponible(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const saveUiPrefs = (prefs: { sidebar: boolean; dark: boolean }) => {
    fetch("/api/section/ui-prefs", {
      method: "PUT",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(prefs),
    }).catch(() => { /* best-effort */ });
  };

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      saveUiPrefs({ sidebar: next, dark: darkMode });
      return next;
    });
  };

  const toggleDark = () => {
    setDarkMode((d) => {
      const next = !d;
      saveUiPrefs({ sidebar: collapsed, dark: next });
      return next;
    });
  };

  const closeDrawer = () => setDrawerOpen(false);

  const handleLogout = useCallback(async () => {
    await fetch("/api/logout", { method: "POST" });
    router.push("/login");
  }, [router]);

  const nav = (
    <nav className={styles.nav}>
      {SECTIONS.map((s) => {
        const active = s.slug === "/" ? pathname === "/" : pathname.startsWith(s.slug);
        const total = alerts ? alerts.overdue + alerts.soon : 0;
        const isCoches = s.slug === "/coches";
        const isHogar = s.slug === "/hogar";
        return (
          <Link
            key={s.slug}
            href={s.slug}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
            title={
              isCoches && alerts && total > 0
                ? `${alerts.overdue} vencido${alerts.overdue === 1 ? "" : "s"}, ${alerts.soon} próxim${alerts.soon === 1 ? "o" : "os"} en Coches`
                : isHogar && disponible !== null
                  ? `Disponible total: ${currencySidebar.format(disponible)}`
                  : s.label
            }
            onClick={closeDrawer}
          >
            {s.icon}
            {!collapsed && <span className={styles.navLabel}>{s.label}</span>}
            {isHogar && disponible !== null && (
              <span
                className={styles.navBadge}
                style={{ background: disponible >= 0 ? "#16a34a" : "#dc2626" }}
              >
                {currencySidebar.format(disponible)}
              </span>
            )}
            {isCoches && total > 0 && (
              <span
                className={styles.navBadge}
                style={{ background: alerts!.overdue > 0 ? "#ef4444" : "#f59e0b" }}
              >
                {total}
              </span>
            )}
          </Link>
        );
      })}
    </nav>
  );

  return (
    <div className={styles.shell} data-theme={darkMode ? "dark" : undefined}>
      {drawerOpen && (
        <div className={styles.backdrop} onClick={() => setDrawerOpen(false)} />
      )}
      <aside
        className={`${styles.sidebar} ${collapsed ? styles.sidebarCollapsed : ""} ${drawerOpen ? styles.sidebarOpen : ""}`}
      >
        <button
          type="button"
          className={styles.chevron}
          onClick={toggleCollapsed}
          aria-label={collapsed ? "Expandir menú" : "Contraer menú"}
        >
          <svg
            width="16"
            height="16"
            viewBox="0 0 24 24"
            fill="none"
            stroke="currentColor"
            strokeWidth="2"
            strokeLinecap="round"
            strokeLinejoin="round"
            style={{ transform: collapsed ? "rotate(180deg)" : undefined }}
          >
            <polyline points="15 18 9 12 15 6" />
          </svg>
        </button>
        {nav}
        <div className={styles.sidebarFooter}>
          <button
            type="button"
            className={styles.navLink}
            onClick={toggleDark}
            title={darkMode ? "Modo claro" : "Modo oscuro"}
          >
            {darkMode ? (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <circle cx="12" cy="12" r="5" /><line x1="12" y1="1" x2="12" y2="3" /><line x1="12" y1="21" x2="12" y2="23" /><line x1="4.22" y1="4.22" x2="5.64" y2="5.64" /><line x1="18.36" y1="18.36" x2="19.78" y2="19.78" /><line x1="1" y1="12" x2="3" y2="12" /><line x1="21" y1="12" x2="23" y2="12" /><line x1="4.22" y1="19.78" x2="5.64" y2="18.36" /><line x1="18.36" y1="5.64" x2="19.78" y2="4.22" />
              </svg>
            ) : (
              <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
                <path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z" />
              </svg>
            )}
            {!collapsed && <span className={styles.navLabel}>{darkMode ? "Claro" : "Oscuro"}</span>}
          </button>
          <button
            type="button"
            className={styles.navLink}
            onClick={handleLogout}
            title="Salir"
          >
            <svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
              <path d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" /><polyline points="16 17 21 12 16 7" /><line x1="21" y1="12" x2="9" y2="12" />
            </svg>
            {!collapsed && <span className={styles.navLabel}>Salir</span>}
          </button>
        </div>
      </aside>
      <main className={styles.main}>
        <header className={styles.mobileHeader}>
          <button
            type="button"
            className={styles.hamburger}
            onClick={() => setDrawerOpen((o) => !o)}
            aria-label="Abrir menú"
          >
            <svg width="22" height="22" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
              <line x1="3" y1="6" x2="21" y2="6" /><line x1="3" y1="12" x2="21" y2="12" /><line x1="3" y1="18" x2="21" y2="18" />
            </svg>
          </button>
        </header>
        {children}
      </main>
    </div>
  );
}
