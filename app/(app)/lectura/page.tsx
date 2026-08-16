import type { Metadata } from "next";
import NoteSection from "../note-section";

export const metadata: Metadata = {
  title: "Lectura · Panel",
};

export default function LecturaPage() {
  return <NoteSection slug="lectura" />;
}
