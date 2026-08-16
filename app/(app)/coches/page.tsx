import type { Metadata } from "next";
import CochesManager from "../coches-manager";

export const metadata: Metadata = {
  title: "Coches · Panel",
};

export default function CochesPage() {
  return <CochesManager />;
}
