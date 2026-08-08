import { useState, type FormEvent } from "react";
import { login, register } from "../api/client";
import { useGameStore } from "../store/gameStore";
import { SettlementArt } from "./SettlementArt";

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
    <div className="panel-screen atmosphere">
      <div className="atmosphere-art" aria-hidden>
        <SettlementArt />
      </div>
      <div className="panel auth-panel chrome-panel">
        <div className="panel-hero-strip" aria-hidden>
          <SettlementArt />
        </div>
        <div className="brand-lockup">
          <span className="brand-mark" aria-hidden />
          <div>
            <p className="eyebrow">Settlement strategy</p>
            <h1 className="brand-title">Techtonic</h1>
          </div>
        </div>
        <p className="lede hero-tagline">Rise from stone to stars.</p>
        <p className="muted auth-sub">
          Sign in to save your camp in the cloud and continue the climb across ages.
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
            {busy ? "Please wait…" : mode === "login" ? "Enter camp" : "Create account"}
          </button>
        </form>
      </div>
    </div>
  );
}
