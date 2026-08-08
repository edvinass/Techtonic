import { useEffect, useRef, useState, type CSSProperties } from "react";
import { AGES } from "../data/ages";
import { BUILDINGS } from "../data/buildings";
import { SEASON_INFO } from "../data/events";
import { RESOURCE_ORDER, RESOURCES } from "../data/resources";
import { TECH_LIST } from "../data/techs";
import { ageUpRequirements, getBuildableTypes, isTechAvailable } from "../sim/engine";
import { defenceReadiness } from "../sim/pressure";
import type { PriorityId, ResourceId, Resources } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { putSave } from "../api/client";
import { ResourceIcon } from "./ResourceIcon";

const PRIORITIES: PriorityId[] = [
  "food",
  "construction",
  "research",
  "production",
  "defence",
];

const PRIORITY_LABELS: Record<PriorityId, string> = {
  food: "Food",
  construction: "Build",
  research: "Research",
  production: "Gather",
  defence: "Defence",
};

type SideTab = "build" | "priorities" | "tech" | "age";

function canPay(resources: Resources, cost: Partial<Resources>): boolean {
  return (Object.keys(cost) as ResourceId[]).every((k) => resources[k] >= (cost[k] ?? 0));
}

function formatAmount(n: number): string {
  const v = Math.floor(n);
  if (v >= 10_000) return `${(v / 1000).toFixed(1)}k`;
  return String(v);
}

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

  const [sideTab, setSideTab] = useState<SideTab>("build");
  const [sideCollapsed, setSideCollapsed] = useState(false);
  const [saveOpen, setSaveOpen] = useState(false);
  const prevResources = useRef<Resources | null>(null);
  const [deltas, setDeltas] = useState<Partial<Record<ResourceId, number>>>({});
  const saveMenuRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!state) return;
    const prev = prevResources.current;
    if (prev) {
      const next: Partial<Record<ResourceId, number>> = {};
      for (const id of RESOURCE_ORDER) {
        const d = state.resources[id] - prev[id];
        if (Math.abs(d) >= 0.05) next[id] = d;
      }
      setDeltas(next);
    }
    prevResources.current = { ...state.resources };
  }, [state?.tick]); // eslint-disable-line react-hooks/exhaustive-deps -- sample per sim tick

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        const { selectedBuilding: sel, selectBuilding: clear } = useGameStore.getState();
        if (sel) {
          clear(null);
          useGameStore.getState().setStatus(null);
        }
        setSaveOpen(false);
      }
      if (e.key === "p" || e.key === "P") {
        const t = e.target as HTMLElement | null;
        if (t && (t.tagName === "INPUT" || t.tagName === "TEXTAREA" || t.isContentEditable)) return;
        useGameStore.getState().togglePause();
      }
    }
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  useEffect(() => {
    if (!saveOpen) return;
    function onPointer(e: MouseEvent) {
      if (saveMenuRef.current && !saveMenuRef.current.contains(e.target as Node)) {
        setSaveOpen(false);
      }
    }
    document.addEventListener("mousedown", onPointer);
    return () => document.removeEventListener("mousedown", onPointer);
  }, [saveOpen]);

  if (!state) return null;

  const age = AGES[state.age];
  const buildable = getBuildableTypes(state);
  const ageReq = ageUpRequirements(state);
  const defencePct = Math.round(defenceReadiness(state.priorities) * 100);
  const popTight = state.population.count >= state.population.housingCap;
  const foodLow = state.resources.food < state.population.count * 2;
  const selectedDef = selectedBuilding ? BUILDINGS[selectedBuilding] : null;

  async function saveToSlot(slot: number) {
    const current = useGameStore.getState().state;
    if (!token || !current) return;
    const payload = getSavePayload();
    if (!payload) return;
    try {
      await putSave(token, slot, {
        name: `${AGES[current.age].name} settlement`,
        age: current.age,
        schema_version: 2,
        state: payload,
      });
      setSaveMeta(slot, Date.now());
      setStatus(`Saved to slot ${slot}`);
      setSaveOpen(false);
    } catch (err) {
      setStatus(err instanceof Error ? err.message : "Save failed");
    }
  }

  const nextAge = ageReq.nextAge ? AGES[ageReq.nextAge] : null;
  const keyTechName = age.keyTech
    ? (TECH_LIST.find((t) => t.id === age.keyTech)?.name ?? age.keyTech)
    : null;
  const landmarkName = age.landmark ? (BUILDINGS[age.landmark]?.name ?? age.landmark) : null;

  const tabs: { id: SideTab; label: string; badge?: string }[] = [
    { id: "build", label: "Build" },
    { id: "priorities", label: "Work" },
    { id: "tech", label: "Tech", badge: state.research.active ? "…" : undefined },
    {
      id: "age",
      label: "Age",
      badge: ageReq.ready ? "!" : undefined,
    },
  ];

  return (
    <div className={`hud${sideCollapsed ? " side-collapsed" : ""}`}>
      <header className="hud-top">
        <div className="hud-identity">
          <span className="brand">Techtonic</span>
          <span className="age-pill">{age.name}</span>
          <span
            className={`season-pill season-${state.pressure.season}`}
            title={SEASON_INFO[state.pressure.season].blurb}
          >
            {SEASON_INFO[state.pressure.season].label}
          </span>
          {state.pressure.raidWarningTicks > 0 && (
            <span className="raid-warn">Raid in {state.pressure.raidWarningTicks}</span>
          )}
        </div>

        <div className="resources" role="group" aria-label="Resources">
          {RESOURCE_ORDER.map((id) => {
            const amount = state.resources[id];
            const delta = deltas[id];
            const critical = id === "food" && foodLow;
            return (
              <span
                key={id}
                className={`resource-chip${critical ? " critical" : ""}`}
                style={{ "--res": `#${RESOURCES[id].hex}` } as CSSProperties}
                title={RESOURCES[id].label}
              >
                <ResourceIcon id={id} size={16} />
                <em>{RESOURCES[id].label}</em>
                <strong>{formatAmount(amount)}</strong>
                <span
                  className={`res-delta${
                    delta != null && Math.abs(delta) >= 0.5
                      ? delta > 0
                        ? " up"
                        : " down"
                      : ""
                  }`}
                >
                  {delta != null && Math.abs(delta) >= 0.5
                    ? `${delta > 0 ? "+" : ""}${delta > 0 ? Math.floor(delta) : Math.ceil(delta)}`
                    : ""}
                </span>
              </span>
            );
          })}
        </div>

        <div className="hud-actions">
          <span className={`pop-chip${popTight ? " tight" : ""}`} title="Population / housing">
            <span className="pop-label">Pop</span>
            <strong>
              {state.population.count}
              <span className="pop-sep">/</span>
              {state.population.housingCap}
            </strong>
          </span>
          <button
            type="button"
            className={`pause-btn${state.paused ? " is-paused" : ""}`}
            onClick={togglePause}
            title="Pause / resume (P)"
          >
            {state.paused ? "Resume" : "Pause"}
          </button>
          <div className="save-menu" ref={saveMenuRef}>
            <button
              type="button"
              className={saveOpen ? "active" : ""}
              onClick={() => setSaveOpen((o) => !o)}
              title="Save game"
            >
              Save{saveSlot ? ` ${saveSlot}` : ""}
            </button>
            {saveOpen && (
              <div className="save-dropdown" role="menu">
                <button type="button" role="menuitem" onClick={() => void saveToSlot(saveSlot ?? 1)}>
                  Quick save (slot {saveSlot ?? 1})
                </button>
                {[1, 2, 3].map((slot) => (
                  <button key={slot} type="button" role="menuitem" onClick={() => void saveToSlot(slot)}>
                    Slot {slot}
                    {saveSlot === slot ? " · current" : ""}
                  </button>
                ))}
              </div>
            )}
          </div>
          <button type="button" onClick={() => setScreen("menu")}>
            Menu
          </button>
        </div>
      </header>

      {selectedDef && (
        <div className="placement-banner">
          <strong>Placing {selectedDef.name}</strong>
          <span>Click the map to build · Esc to cancel</span>
          <button type="button" onClick={() => selectBuilding(null)}>
            Cancel
          </button>
        </div>
      )}
      {statusMessage && (
        <div className={`status-toast${selectedDef ? " below-placement" : ""}`}>{statusMessage}</div>
      )}
      {lastSavedAt && (
        <div className="autosave-hint">
          Saved {new Date(lastSavedAt).toLocaleTimeString()}
        </div>
      )}

      {!tutorialDismissed && (
        <div className="tutorial">
          <p>
            Out of wood? Raise Gather under Work — citizens hand-chop trees until you can afford a
            Lumber Camp. Pan with right-drag / WASD. Pause with P.
          </p>
          <button type="button" onClick={dismissTutorial}>
            Got it
          </button>
        </div>
      )}

      <aside className={`hud-side${sideCollapsed ? " collapsed" : ""}`}>
        <div className="hud-side-tabs">
          {tabs.map((t) => (
            <button
              key={t.id}
              type="button"
              className={sideTab === t.id && !sideCollapsed ? "active" : ""}
              onClick={() => {
                if (sideCollapsed) {
                  setSideCollapsed(false);
                  setSideTab(t.id);
                } else if (sideTab === t.id) {
                  setSideCollapsed(true);
                } else {
                  setSideTab(t.id);
                }
              }}
            >
              {t.label}
              {t.badge && <span className="tab-badge">{t.badge}</span>}
            </button>
          ))}
          <button
            type="button"
            className="side-collapse"
            title={sideCollapsed ? "Expand panel" : "Collapse panel"}
            onClick={() => setSideCollapsed((c) => !c)}
          >
            {sideCollapsed ? "◀" : "▶"}
          </button>
        </div>

        {!sideCollapsed && sideTab === "build" && (
          <section>
            <h3>Build</h3>
            <p className="muted panel-hint">Select a building, then click the map.</p>
            <div className="build-list">
              {buildable.map((id) => {
                const def = BUILDINGS[id];
                const affordable = canPay(state.resources, def.cost);
                return (
                  <button
                    key={id}
                    type="button"
                    className={`${selectedBuilding === id ? "active" : ""}${affordable ? "" : " unaffordable"}`}
                    title={def.description}
                    onClick={() => selectBuilding(selectedBuilding === id ? null : id)}
                  >
                    <strong>{def.name}</strong>
                    <span className="cost-row">
                      {(Object.entries(def.cost) as [ResourceId, number][]).map(([k, v]) => {
                        const short = state.resources[k] < v;
                        return (
                          <span
                            key={k}
                            className={`cost-item${short ? " short" : ""}`}
                            title={RESOURCES[k].label}
                          >
                            <ResourceIcon id={k} size={12} />
                            {v}
                          </span>
                        );
                      })}
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!sideCollapsed && sideTab === "priorities" && (
          <section>
            <h3>Work priorities</h3>
            <p className="muted panel-hint">
              Defence readiness <strong>{defencePct}%</strong> — blunts raids and wolves.
            </p>
            {PRIORITIES.map((p) => (
              <label key={p} className="priority">
                <span>{PRIORITY_LABELS[p]}</span>
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
        )}

        {!sideCollapsed && sideTab === "tech" && (
          <section>
            <h3>Technology</h3>
            {state.research.active && (
              <div className="research-progress">
                <div className="research-progress-meta">
                  <span>
                    Researching{" "}
                    <strong>
                      {TECH_LIST.find((t) => t.id === state.research.active!.techId)?.name ??
                        state.research.active.techId}
                    </strong>
                  </span>
                  <span>{Math.floor(state.research.active.progress * 100)}%</span>
                </div>
                <div className="progress-track">
                  <div
                    className="progress-fill"
                    style={{ width: `${Math.min(100, state.research.active.progress * 100)}%` }}
                  />
                </div>
              </div>
            )}
            <div className="tech-list">
              {TECH_LIST.map((tech) => {
                const unlocked = state.research.unlocked.includes(tech.id);
                const available = isTechAvailable(state, tech.id);
                const affordable = state.resources.knowledge >= tech.costKnowledge;
                return (
                  <button
                    key={tech.id}
                    type="button"
                    disabled={unlocked || !available || !!state.research.active || !affordable}
                    className={unlocked ? "unlocked" : ""}
                    title={tech.description}
                    onClick={() => research(tech.id)}
                  >
                    <strong>
                      {tech.name}
                      {unlocked ? " ✓" : ""}
                    </strong>
                    <span className="cost-row">
                      {!unlocked && (
                        <span
                          className={`cost-item${!affordable ? " short" : ""}`}
                          title="Knowledge"
                        >
                          <ResourceIcon id="knowledge" size={12} />
                          {tech.costKnowledge}
                        </span>
                      )}
                      <span className="tech-desc">{tech.description}</span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!sideCollapsed && sideTab === "age" && nextAge && (
          <section className="age-up">
            <h3>Advance to {nextAge.name}</h3>
            <p className="muted panel-hint">{age.blurb}</p>
            <ul>
              {keyTechName && (
                <li className={ageReq.hasTech ? "ok" : ""}>Research {keyTechName}</li>
              )}
              {landmarkName && (
                <li className={ageReq.hasLandmark ? "ok" : ""}>
                  Build {landmarkName} landmark
                </li>
              )}
              <li className={ageReq.hasPopulation ? "ok" : ""}>
                Population ≥ {age.minPopulation ?? 0}
              </li>
              <li className={ageReq.canPay ? "ok" : ""}>
                Pay{" "}
                <span className="cost-row inline">
                  {(Object.entries(age.cost ?? {}) as [ResourceId, number][]).map(([k, v]) => (
                    <span key={k} className="cost-item" title={RESOURCES[k].label}>
                      <ResourceIcon id={k} size={12} /> {v}
                    </span>
                  ))}
                </span>
              </li>
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
              Enter {nextAge.name}
            </button>
          </section>
        )}

        {!sideCollapsed && sideTab === "age" && !nextAge && (
          <section className="age-up done">
            <h3>{age.name}</h3>
            <p>{age.blurb}</p>
          </section>
        )}
      </aside>
    </div>
  );
}
