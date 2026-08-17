"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useState } from "react";
import { parseCochesState, pendingAlerts, type Alerts } from "@/lib/coches";
import { parseState, BANK_IDS, currentMonthKey, comidaAmount } from "@/lib/state";
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

const SIDEBAR_KEY = "cartera:sidebar";

const currencySidebar = new Intl.NumberFormat("es-ES", { style: "currency", currency: "EUR", minimumFractionDigits: 0, maximumFractionDigits: 0 });

function readCollapsed(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return localStorage.getItem(SIDEBAR_KEY) === "1";
  } catch { return false; }
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  const [collapsed, setCollapsed] = useState(readCollapsed);
  const [drawerOpen, setDrawerOpen] = useState(false);
  const [alerts, setAlerts] = useState<Alerts | null>(null);
  const [disponible, setDisponible] = useState<number | null>(null);
  const pathname = usePathname();
  const router = useRouter();

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
        const active = state.months[curKey] ?? { banks: {} as Record<string, string>, expenses: [], comidaDaily: "40", comidaBank: "" as const };
        const bankTotal = BANK_IDS.reduce((s, id) => s + (Number.parseFloat(active.banks[id]) || 0), 0);
        const pendientes = active.expenses.filter((e: { paid?: boolean }) => !e.paid).reduce((s: number, e: { amount: string }) => s + (Number.parseFloat(e.amount) || 0), 0) + comidaAmount(active, curKey);
        if (!cancelled) setDisponible(bankTotal - pendientes);
      } catch {
        if (!cancelled) setDisponible(null);
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const toggleCollapsed = () => {
    setCollapsed((c) => {
      const next = !c;
      try { localStorage.setItem(SIDEBAR_KEY, next ? "1" : "0"); } catch { /* */ }
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
        const isFinanzas = s.slug === "/";
        return (
          <Link
            key={s.slug}
            href={s.slug}
            className={`${styles.navLink} ${active ? styles.navLinkActive : ""}`}
            title={
              isCoches && alerts && total > 0
                ? `${alerts.overdue} vencido${alerts.overdue === 1 ? "" : "s"}, ${alerts.soon} próxim${alerts.soon === 1 ? "o" : "os"} en Coches`
                : isFinanzas && disponible !== null
                  ? `Disponible total: ${currencySidebar.format(disponible)}`
                  : s.label
            }
            onClick={closeDrawer}
          >
            {s.icon}
            {!collapsed && <span className={styles.navLabel}>{s.label}</span>}
            {isFinanzas && disponible !== null && (
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
    <div className={styles.shell}>
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
