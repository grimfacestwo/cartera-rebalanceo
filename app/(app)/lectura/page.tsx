import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Lectura · Panel",
};

const LecturaManager = dynamic(() => import("../lectura-manager"), {
  loading: () => <div style={{ padding: "1.5rem" }}>Cargando…</div>,
});

export default function LecturaPage() {
  return <LecturaManager />;
}
