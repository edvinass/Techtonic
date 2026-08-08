import { useEffect } from "react";
import { putSave } from "../api/client";
import { PhaserGame } from "../game/PhaserGame";
import { AGES } from "../data/ages";
import { useGameStore } from "../store/gameStore";
import { EventModal } from "./EventModal";
import { Hud } from "./Hud";

const TICK_MS = 1000;
const AUTOSAVE_MS = 60_000;

export function GameScreen() {
  const stepTick = useGameStore((s) => s.stepTick);
  const state = useGameStore((s) => s.state);
  const token = useGameStore((s) => s.token);
  const saveSlot = useGameStore((s) => s.saveSlot);
  const getSavePayload = useGameStore((s) => s.getSavePayload);
  const setSaveMeta = useGameStore((s) => s.setSaveMeta);

  useEffect(() => {
    const id = window.setInterval(() => {
      const current = useGameStore.getState().state;
      if (current && !current.paused && !current.pressure.pendingEventId) stepTick();
    }, TICK_MS);
    return () => window.clearInterval(id);
  }, [stepTick]);

  useEffect(() => {
    const id = window.setInterval(() => {
      const store = useGameStore.getState();
      if (!store.token || !store.state) return;
      const slot = store.saveSlot ?? 1;
      const payload = store.getSavePayload();
      if (!payload) return;
      const ageName = AGES[store.state.age]?.name ?? store.state.age;
      void putSave(store.token, slot, {
        name: `${ageName} settlement`,
        age: store.state.age,
        schema_version: 2,
        state: payload,
      })
        .then(() => setSaveMeta(slot, Date.now()))
        .catch(() => {
          /* silent autosave failure */
        });
    }, AUTOSAVE_MS);
    return () => window.clearInterval(id);
  }, [token, saveSlot, getSavePayload, setSaveMeta]);

  if (!state) return null;

  return (
    <div className="game-screen">
      <PhaserGame />
      <Hud />
      <EventModal />
    </div>
  );
}
