import { useEffect, useState } from "react";
import { deleteSave, getSave, listSaves, type SaveMeta } from "../api/client";
import { useGameStore } from "../store/gameStore";

export function MenuScreen() {
  const token = useGameStore((s) => s.token);
  const email = useGameStore((s) => s.email);
  const newGame = useGameStore((s) => s.newGame);
  const loadGame = useGameStore((s) => s.loadGame);
  const logout = useGameStore((s) => s.logout);
  const [saves, setSaves] = useState<SaveMeta[]>([]);
  const [error, setError] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  async function refresh() {
    if (!token) return;
    setLoading(true);
    setError(null);
    try {
      setSaves(await listSaves(token));
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load saves");
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void refresh();
  }, [token]);

  async function onLoad(slot: number) {
    if (!token) return;
    try {
      const save = await getSave(token, slot);
      loadGame(save.state, slot);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load");
    }
  }

  async function onDelete(slot: number) {
    if (!token) return;
    try {
      await deleteSave(token, slot);
      await refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    }
  }

  return (
    <div className="panel-screen">
      <div className="panel menu-panel">
        <div className="menu-header">
          <div>
            <p className="eyebrow">Techtonic</p>
            <h1>Your settlements</h1>
            <p className="lede">Signed in as {email}</p>
          </div>
          <button type="button" onClick={logout}>
            Log out
          </button>
        </div>

        <button type="button" className="primary" onClick={newGame}>
          New Stone Age game
        </button>

        <h2>Cloud save slots</h2>
        {loading && <p>Loading saves…</p>}
        {error && <p className="error">{error}</p>}
        <div className="save-grid">
          {saves.map((save) => (
            <div key={save.slot} className="save-card">
              <div>
                <strong>Slot {save.slot}</strong>
                {save.empty ? (
                  <p>Empty</p>
                ) : (
                  <>
                    <p>{save.name}</p>
                    <p className="muted">
                      {save.age} · {new Date(save.updated_at).toLocaleString()}
                    </p>
                  </>
                )}
              </div>
              <div className="row">
                <button
                  type="button"
                  disabled={save.empty}
                  onClick={() => void onLoad(save.slot)}
                >
                  Load
                </button>
                <button
                  type="button"
                  disabled={save.empty}
                  onClick={() => void onDelete(save.slot)}
                >
                  Delete
                </button>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
