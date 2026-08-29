import type { Metadata } from "next";
import dynamic from "next/dynamic";

export const metadata: Metadata = {
  title: "Hogar · Panel",
};

const HogarManager = dynamic(() => import("../hogar-manager"), {
  loading: () => <div style={{ padding: "1.5rem" }}>Cargando…</div>,
});

export default function HogarPage() {
  return <HogarManager />;
}
