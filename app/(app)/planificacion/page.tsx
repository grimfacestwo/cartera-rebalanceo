import type { Metadata } from "next";
import NoteSection from "../note-section";

export const metadata: Metadata = {
  title: "Planificación · Panel",
};

export default function PlanificacionPage() {
  return <NoteSection slug="planificacion" />;
}
