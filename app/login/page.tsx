import type { Metadata } from "next";
import { redirect } from "next/navigation";
import { cookies } from "next/headers";
import { expectedToken } from "@/lib/auth";
import LoginForm from "./login-form";

export const metadata: Metadata = {
  title: "Acceso · Cartera Rebalanceo",
};

export default async function LoginPage() {
  const token = await expectedToken();
  if (token) {
    const store = await cookies();
    if (store.get("site_auth")?.value === token) redirect("/");
  }
  return <LoginForm locked={token !== null} />;
}
