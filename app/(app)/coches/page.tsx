import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Coches · Panel",
};

const CochesManager = dynamic(() => import("../coches-manager"), {
  loading: () => <div style={{ padding: "1.5rem" }}>Cargando…</div>,
});

export default function CochesPage() {
  return <CochesManager />;
}
