import { useState, type FormEvent } from "react";
import { login, register } from "../api/client";
import { useGameStore } from "../store/gameStore";

export function AuthScreen() {
  const setAuth = useGameStore((s) => s.setAuth);
  const [mode, setMode] = useState<"login" | "register">("login");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function onSubmit(e: FormEvent) {
    e.preventDefault();
    setError(null);
    setBusy(true);
    try {
      if (mode === "register") {
        await register(email.trim(), password);
      }
      const token = await login(email.trim(), password);
      setAuth(token.access_token, email.trim().toLowerCase());
    } catch (err) {
      setError(err instanceof Error ? err.message : "Authentication failed");
    } finally {
      setBusy(false);
    }
  }

  return (
    <div className="panel-screen">
      <div className="panel auth-panel">
        <p className="eyebrow">Techtonic</p>
        <h1>Rise from stone to stars</h1>
        <p className="lede">
          Sign in to save your settlement in the cloud and continue across sessions.
        </p>
        <div className="tabs">
          <button
            type="button"
            className={mode === "login" ? "active" : ""}
            onClick={() => setMode("login")}
          >
            Login
          </button>
          <button
            type="button"
            className={mode === "register" ? "active" : ""}
            onClick={() => setMode("register")}
          >
            Register
          </button>
        </div>
        <form onSubmit={onSubmit}>
          <label>
            Email
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
            />
          </label>
          <label>
            Password
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              minLength={8}
              autoComplete={mode === "login" ? "current-password" : "new-password"}
            />
          </label>
          {error && <p className="error">{error}</p>}
          <button type="submit" className="primary" disabled={busy}>
            {busy ? "Please wait…" : mode === "login" ? "Enter" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
