"use client";

import { useState, type FormEvent } from "react";
import { useRouter } from "next/navigation";
import styles from "./login.module.css";

export default function LoginForm({ locked }: { locked: boolean }) {
  const [password, setPassword] = useState("");
  const [error, setError] = useState("");
  const [busy, setBusy] = useState(false);
  const router = useRouter();

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError("");
    try {
      const res = await fetch("/api/login", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });
      if (res.ok) {
        router.push("/");
      } else {
        setError("Contraseña incorrecta");
        setPassword("");
      }
    } catch {
      setError("No se pudo iniciar sesión");
    } finally {
      setBusy(false);
    }
  };

  return (
    <main className={styles.wrap}>
      <form className={styles.form} onSubmit={submit}>
        <h1 className={styles.title}>Cartera Rebalanceo</h1>
        <p className={styles.subtitle}>Introduce la contraseña para acceder.</p>
        <input
          type="password"
          className={styles.input}
          value={password}
          onChange={(e) => setPassword(e.target.value)}
          placeholder="Contraseña"
          autoFocus
          aria-label="Contraseña"
        />
        {error && <p className={styles.error}>{error}</p>}
        {!locked && (
          <p className={styles.warn}>
            La contraseña no está configurada en el servidor.
          </p>
        )}
        <button type="submit" className={styles.button} disabled={busy}>
          {busy ? "Comprobando…" : "Entrar"}
        </button>
      </form>
    </main>
  );
}
