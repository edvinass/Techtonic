import { AGES } from "../data/ages";
import { BUILDINGS } from "../data/buildings";
import { TECH_LIST } from "../data/techs";
import { ageUpRequirements, getBuildableTypes, isTechAvailable } from "../sim/engine";
import type { PriorityId } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { putSave } from "../api/client";

const PRIORITIES: PriorityId[] = [
  "food",
  "construction",
  "research",
  "production",
  "defence",
];

export function Hud() {
  const state = useGameStore((s) => s.state);
  const selectedBuilding = useGameStore((s) => s.selectedBuilding);
  const selectBuilding = useGameStore((s) => s.selectBuilding);
  const updatePriorities = useGameStore((s) => s.updatePriorities);
  const research = useGameStore((s) => s.research);
  const tryAgeUp = useGameStore((s) => s.tryAgeUp);
  const togglePause = useGameStore((s) => s.togglePause);
  const statusMessage = useGameStore((s) => s.statusMessage);
  const token = useGameStore((s) => s.token);
  const saveSlot = useGameStore((s) => s.saveSlot);
  const setSaveMeta = useGameStore((s) => s.setSaveMeta);
  const getSavePayload = useGameStore((s) => s.getSavePayload);
  const setStatus = useGameStore((s) => s.setStatus);
  const setScreen = useGameStore((s) => s.setScreen);
  const lastSavedAt = useGameStore((s) => s.lastSavedAt);
  const tutorialDismissed = useGameStore((s) => s.tutorialDismissed);
  const dismissTutorial = useGameStore((s) => s.dismissTutorial);

  if (!state) return null;

  const age = AGES[state.age];
  const buildable = getBuildableTypes(state);
  const ageReq = ageUpRequirements(state);

  async function saveToSlot(slot: number) {
    const current = useGameStore.getState().state;
    if (!token || !current) return;
    const payload = getSavePayload();
    if (!payload) return;
    try {
      await putSave(token, slot, {
        name: `${AGES[current.age].name} settlement`,
        age: current.age,
        schema_version: 1,
        state: payload,
      });
      setSaveMeta(slot, Date.now());
      setStatus(`Saved to slot ${slot}`);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    }
  }

  return (
    <div className="hud">
      <header className="hud-top">
        <div>
          <span className="brand">Techtonic</span>
          <span className="age-pill">{age.name}</span>
        </div>
        <div className="resources">
          {(
            [
              ["food", state.resources.food],
              ["wood", state.resources.wood],
              ["stone", state.resources.stone],
              ["metal", state.resources.metal],
              ["knowledge", state.resources.knowledge],
            ] as const
          ).map(([id, value]) => (
            <span key={id}>
              {id} <strong>{Math.floor(value)}</strong>
            </span>
          ))}
        </div>
        <div className="hud-actions">
          <span>
            Pop {state.population.count}/{state.population.housingCap}
          </span>
          <button type="button" onClick={togglePause}>
            {state.paused ? "Resume" : "Pause"}
          </button>
          <button type="button" onClick={() => void saveToSlot(saveSlot ?? 1)}>
            Save {saveSlot ? `(${saveSlot})` : ""}
          </button>
          <div className="slot-row">
            {[1, 2, 3].map((slot) => (
              <button key={slot} type="button" onClick={() => void saveToSlot(slot)}>
                {slot}
              </button>
            ))}
          </div>
          <button type="button" onClick={() => setScreen("menu")}>
            Menu
          </button>
        </div>
      </header>

      {statusMessage && <div className="status-toast">{statusMessage}</div>}
      {lastSavedAt && (
        <div className="autosave-hint">
          Last saved {new Date(lastSavedAt).toLocaleTimeString()}
        </div>
      )}

      {!tutorialDismissed && (
        <div className="tutorial">
          <p>
            Place lumber camps on forests, raise houses, set priorities, then research Fire →
            Farming. Build a Granary and advance when ready. WASD pan, scroll zoom, right-drag
            pan.
          </p>
          <button type="button" onClick={dismissTutorial}>
            Got it
          </button>
        </div>
      )}

      <aside className="hud-side">
        <section>
          <h3>Build</h3>
          <div className="build-list">
            {buildable.map((id) => {
              const def = BUILDINGS[id];
              return (
                <button
                  key={id}
                  type="button"
                  className={selectedBuilding === id ? "active" : ""}
                  onClick={() => selectBuilding(selectedBuilding === id ? null : id)}
                >
                  <strong>{def.name}</strong>
                  <span>
                    {Object.entries(def.cost)
                      .map(([k, v]) => `${v} ${k}`)
                      .join(" · ")}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        <section>
          <h3>Priorities</h3>
          {PRIORITIES.map((p) => (
            <label key={p} className="priority">
              <span>{p}</span>
              <input
                type="range"
                min={0}
                max={100}
                value={state.priorities[p]}
                onChange={(e) =>
                  updatePriorities({
                    ...state.priorities,
                    [p]: Number(e.target.value),
                  })
                }
              />
              <em>{state.priorities[p]}</em>
            </label>
          ))}
        </section>

        <section>
          <h3>Technology</h3>
          {state.research.active && (
            <p className="muted">
              Researching {state.research.active.techId} (
              {Math.floor(state.research.active.progress * 100)}%)
            </p>
          )}
          <div className="tech-list">
            {TECH_LIST.map((tech) => {
              const unlocked = state.research.unlocked.includes(tech.id);
              const available = isTechAvailable(state, tech.id);
              return (
                <button
                  key={tech.id}
                  type="button"
                  disabled={unlocked || !available || !!state.research.active}
                  onClick={() => research(tech.id)}
                >
                  <strong>
                    {tech.name}
                    {unlocked ? " ✓" : ""}
                  </strong>
                  <span>
                    {tech.costKnowledge} knowledge · {tech.description}
                  </span>
                </button>
              );
            })}
          </div>
        </section>

        {state.age === "stone" && (
          <section className="age-up">
            <h3>Advance to Farming Age</h3>
            <ul>
              <li className={ageReq.hasTech ? "ok" : ""}>Research Farming</li>
              <li className={ageReq.hasLandmark ? "ok" : ""}>Build Granary landmark</li>
              <li className={ageReq.hasPopulation ? "ok" : ""}>Population ≥ 12</li>
              <li className={ageReq.canPay ? "ok" : ""}>Pay 40 food, 30 wood, 20 stone</li>
            </ul>
            <button
              type="button"
              className="primary"
              disabled={!ageReq.ready}
              onClick={() => {
                if (tryAgeUp() && token) {
                  void saveToSlot(saveSlot ?? 1);
                }
              }}
            >
              Enter Farming Age
            </button>
          </section>
        )}

        {state.age === "farming" && (
          <section className="age-up done">
            <h3>Farming Age</h3>
            <p>Farms unlocked. Houses shelter more people. The path to the stars continues…</p>
          </section>
        )}
      </aside>
    </div>
  );
}
