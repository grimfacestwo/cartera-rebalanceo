import type { Metadata } from "next";
import NoteSection from "../note-section";

export const metadata: Metadata = {
  title: "Coches · Panel",
};

export default function CochesPage() {
  return <NoteSection slug="coches" />;
}
