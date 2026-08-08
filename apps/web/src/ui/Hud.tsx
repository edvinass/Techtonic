import { useEffect, useRef, useState, type CSSProperties } from "react";
import { isMuted, play, toggleMute } from "../audio/sfx";
import { AGES } from "../data/ages";
import { BUILDINGS } from "../data/buildings";
import { currentMonthName, SEASON_INFO } from "../data/events";
import { RESOURCE_ORDER, RESOURCES } from "../data/resources";
import { TECH_LIST } from "../data/techs";
import { ageUpRequirements, getBuildableTypes, isTechAvailable } from "../sim/engine";
import { defenceReadiness } from "../sim/pressure";
import {
  forestCoverRatio,
  HARMONY_THRESHOLDS,
  harmonyRequirements,
  housingDefenceCoverage,
  isTechExcluded,
} from "../sim/strategy";
import { applyWorkerCount, PRIORITY_IDS, workerTargets } from "../sim/priorities";
import type { PriorityId, ResourceId, Resources } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { putSave } from "../api/client";
import { BuildingIcon } from "./BuildingIcon";
import { PRIORITY_ACCENT, PriorityIcon } from "./PriorityIcon";
import { ResourceIcon } from "./ResourceIcon";

const PRIORITY_LABELS: Record<PriorityId, string> = {
  food: "Food",
  wood: "Wood",
  stone: "Stone",
  metal: "Metal",
  construction: "Build",
  research: "Research",
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
  const tryHarmonyVictory = useGameStore((s) => s.tryHarmonyVictory);
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
  const [soundOff, setSoundOff] = useState(isMuted);
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

  useEffect(() => {
    if (!state || !selectedBuilding) return;
    const def = BUILDINGS[selectedBuilding];
    if (!canPay(state.resources, def.cost)) {
      selectBuilding(null);
    }
  }, [state, selectedBuilding, selectBuilding]);

  if (!state) return null;

  const age = AGES[state.age];
  const buildable = getBuildableTypes(state);
  const ageReq = ageUpRequirements(state);
  const harmonyReq = harmonyRequirements(state);
  const defencePct = Math.round(defenceReadiness(state) * 100);
  const coverPct = Math.round(housingDefenceCoverage(state) * 100);
  const forestPct = Math.round(forestCoverRatio(state) * 100);
  const strain = Math.round(state.strain);
  const strainLevel = strain >= 70 ? "critical" : strain >= 40 ? "high" : strain >= 15 ? "warm" : "calm";
  const popTight = state.population.count >= state.population.housingCap;
  const foodLow = state.resources.food < state.population.count * 2;
  const selectedDef = selectedBuilding ? BUILDINGS[selectedBuilding] : null;
  const outcome = state.outcome;
  const victoryKind = state.stats.victoryKind;

  async function saveToSlot(slot: number) {
    const current = useGameStore.getState().state;
    if (!token || !current) return;
    const payload = getSavePayload();
    if (!payload) return;
    try {
      await putSave(token, slot, {
        name: `${AGES[current.age].name} settlement`,
        age: current.age,
        schema_version: 4,
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
  const pop = state.population.count;
  const workTargets = workerTargets(state.priorities, pop);
  const workAssigned = PRIORITY_IDS.reduce((sum, id) => sum + workTargets[id], 0);
  const workUnassigned = Math.max(0, pop - workAssigned);
  const hasResearchBuilding = state.buildings.some(
    (b) => BUILDINGS[b.type].priority === "research" && b.progress >= 1,
  );

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
      {outcome !== "playing" && (
        <div className={`outcome-overlay ${outcome}`}>
          <div className="outcome-card">
            <h2>
              {outcome === "victory"
                ? victoryKind === "harmony"
                  ? "Harmony"
                  : "Ascent"
                : "Defeat"}
            </h2>
            <p>
              {outcome === "victory"
                ? victoryKind === "harmony"
                  ? "The woods endure. Your people choose the living world over the void."
                  : "The launch succeeds. Your people leave the cradle of earth behind."
                : "Hunger and hardship empty the camp. The long climb ends here."}
            </p>
            <ul className="outcome-stats">
              <li>
                Peak population <strong>{state.stats.peakPop}</strong>
              </li>
              <li>
                Raids survived <strong>{state.stats.raidsSurvived}</strong>
              </li>
              <li>
                Raids failed <strong>{state.stats.raidsFailed}</strong>
              </li>
              <li>
                Wood harvested <strong>{Math.floor(state.stats.woodHarvested)}</strong>
              </li>
              <li>
                Peak Land Strain <strong>{strain}</strong>
              </li>
              <li>
                Survived <strong>{state.tick}</strong> ticks
              </li>
            </ul>
            <button type="button" className="primary" onClick={() => setScreen("menu")}>
              Return to menu
            </button>
          </div>
        </div>
      )}
      <header className="hud-top">
        <div className="hud-identity">
          <span className="brand-mark sm" aria-hidden />
          <span className="brand">Techtonic</span>
          <span className="age-pill">{age.name}</span>
          <span
            className={`season-pill season-${state.pressure.season}`}
            title={SEASON_INFO[state.pressure.season].blurb}
          >
            {currentMonthName(state.pressure.season, state.pressure.seasonTick)} ·{" "}
            {SEASON_INFO[state.pressure.season].label}
          </span>
          {state.pressure.raidWarningTicks > 0 && (
            <span className="raid-warn">Raid in {state.pressure.raidWarningTicks}</span>
          )}
          <span
            className={`strain-pill strain-${strainLevel}`}
            title="Land Strain rises when you overharvest. High strain hardens raids and can kill forests."
          >
            Strain {strain}
          </span>
        </div>

        <div className="resource-bar" role="group" aria-label="Resources">
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
                <span className="resource-icon-wrap">
                  <ResourceIcon id={id} size={18} />
                </span>
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
          <button
            type="button"
            className={`mute-btn${soundOff ? " is-muted" : ""}`}
            onClick={() => {
              const next = toggleMute();
              setSoundOff(next);
              if (!next) play("ui");
            }}
            title={soundOff ? "Unmute sound" : "Mute sound"}
            aria-pressed={soundOff}
            aria-label={soundOff ? "Unmute sound" : "Mute sound"}
          >
            {soundOff ? "Sound off" : "Sound"}
          </button>
          <div className="save-menu" ref={saveMenuRef}>
            <button
              type="button"
              className={saveOpen ? "active" : ""}
              onClick={() => {
                play("ui");
                setSaveOpen((o) => !o);
              }}
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

      {!tutorialDismissed && outcome === "playing" && (
        <div className="tutorial">
          <p>
            Forests and ore run out. Winters and raids punish thin Defence — research Fortifications
            for towers and walls. Farms want fertile soil by the river. Pan with WASD / right-drag;
            pause with P.
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
          <section className="chrome-panel">
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
                    className={`build-card ${selectedBuilding === id ? "active" : ""}${affordable ? "" : " unaffordable"}`}
                    title={affordable ? def.description : "Not enough resources"}
                    disabled={!affordable}
                    onClick={() => selectBuilding(selectedBuilding === id ? null : id)}
                  >
                    <span className="build-thumb">
                      <BuildingIcon id={id} size={40} />
                    </span>
                    <span className="build-meta">
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
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!sideCollapsed && sideTab === "priorities" && (
          <section className="chrome-panel workers-panel">
            <h3>Workers</h3>

            <div className="worker-force" aria-label="Workforce assignment">
              <div className="worker-force-meta">
                <span>
                  Assigned <strong>{workAssigned}</strong>
                </span>
                <span className={workUnassigned > 0 ? "worker-idle" : undefined}>
                  Idle <strong>{workUnassigned}</strong>
                  <span className="pop-sep"> / </span>
                  {pop}
                </span>
              </div>
              <div className="worker-force-track">
                <div
                  className="worker-force-fill"
                  style={{ width: `${pop > 0 ? (workAssigned / pop) * 100 : 0}%` }}
                />
              </div>
            </div>

            {workTargets.research > 0 && !hasResearchBuilding && (
              <p className="worker-hint">
                Scholars are studying at home — build a Research Hut (needs Fire) for faster
                research.
              </p>
            )}

            <div className="worker-readiness">
              <div className="worker-meter" title="Defence readiness from towers and walls">
                <span className="worker-meter-label">Defence</span>
                <div className="worker-meter-track">
                  <div className="worker-meter-fill defence" style={{ width: `${defencePct}%` }} />
                </div>
                <em>{defencePct}%</em>
              </div>
              <div
                className="worker-meter"
                title="Share of houses covered by nearby towers or palisades"
              >
                <span className="worker-meter-label">Homes</span>
                <div className="worker-meter-track">
                  <div className="worker-meter-fill cover" style={{ width: `${coverPct}%` }} />
                </div>
                <em>{coverPct}%</em>
              </div>
            </div>

            <div className="worker-list">
              {PRIORITY_IDS.map((p, i) => {
                const count = workTargets[p];
                const share = pop > 0 ? (count / pop) * 100 : 0;
                const accent = PRIORITY_ACCENT[p];
                return (
                  <div
                    key={p}
                    className={`worker-card${count > 0 ? " active" : ""}`}
                    style={
                      {
                        "--worker-accent": accent,
                        "--worker-i": i,
                      } as CSSProperties
                    }
                  >
                    <span className="worker-thumb">
                      <PriorityIcon id={p} size={22} />
                    </span>
                    <div className="worker-body">
                      <div className="worker-row-top">
                        <span className="worker-label">{PRIORITY_LABELS[p]}</span>
                        <div className="worker-stepper">
                          <button
                            type="button"
                            aria-label={`Fewer ${PRIORITY_LABELS[p]} workers`}
                            disabled={count <= 0}
                            onClick={() =>
                              updatePriorities(
                                applyWorkerCount(state.priorities, pop, p, count - 1),
                              )
                            }
                          >
                            −
                          </button>
                          <em key={count} className="worker-count">
                            {count}
                          </em>
                          <button
                            type="button"
                            aria-label={`More ${PRIORITY_LABELS[p]} workers`}
                            disabled={workAssigned >= pop}
                            onClick={() =>
                              updatePriorities(
                                applyWorkerCount(state.priorities, pop, p, count + 1),
                              )
                            }
                          >
                            +
                          </button>
                        </div>
                      </div>
                      <div className="worker-alloc-track" aria-hidden>
                        <div className="worker-alloc-fill" style={{ width: `${share}%` }} />
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          </section>
        )}

        {!sideCollapsed && sideTab === "tech" && (
          <section className="chrome-panel">
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
            <p className="muted panel-hint">
              Doctrines can lock each other out — Selective Cuts vs Clearcutting is a real fork.
            </p>
            <div className="tech-list">
              {TECH_LIST.map((tech) => {
                const unlocked = state.research.unlocked.includes(tech.id);
                const excluded = isTechExcluded(state, tech.id);
                const available = isTechAvailable(state, tech.id);
                const affordable = state.resources.knowledge >= tech.costKnowledge;
                return (
                  <button
                    key={tech.id}
                    type="button"
                    disabled={
                      unlocked || excluded || !available || !!state.research.active || !affordable
                    }
                    className={`${unlocked ? "unlocked" : ""}${excluded ? " excluded" : ""}${
                      tech.exclusiveWith?.length ? " doctrine" : ""
                    }`}
                    title={
                      excluded
                        ? `Locked by opposing doctrine (${tech.exclusiveWith?.join(", ")})`
                        : tech.description
                    }
                    onClick={() => research(tech.id)}
                  >
                    <strong>
                      {tech.name}
                      {unlocked ? " ✓" : ""}
                      {excluded ? " ✕" : ""}
                      {tech.exclusiveWith?.length && !unlocked && !excluded ? " ⇄" : ""}
                    </strong>
                    <span className="cost-row">
                      {!unlocked && !excluded && (
                        <span
                          className={`cost-item${!affordable ? " short" : ""}`}
                          title="Knowledge"
                        >
                          <ResourceIcon id="knowledge" size={12} />
                          {tech.costKnowledge}
                        </span>
                      )}
                      <span className="tech-desc">
                        {excluded ? "Locked by opposing doctrine." : tech.description}
                      </span>
                    </span>
                  </button>
                );
              })}
            </div>
          </section>
        )}

        {!sideCollapsed && sideTab === "age" && (
          <>
            {nextAge && (
              <section className="age-up chrome-panel">
                <h3>Ascent → {nextAge.name}</h3>
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

            {!nextAge && (
              <section className="age-up done chrome-panel">
                <h3>{age.name}</h3>
                <p>{age.blurb}</p>
              </section>
            )}

            <section className="age-up chrome-panel harmony-panel">
              <h3>Harmony path</h3>
              <p className="muted panel-hint">
                Alternate victory: steward the forests instead of leaving them. Cover{" "}
                <strong>{forestPct}%</strong> · Strain <strong>{strain}</strong>.
              </p>
              <ul>
                <li className={harmonyReq.hasTech ? "ok" : ""}>Research Stewardship</li>
                <li className={harmonyReq.hasLandmark ? "ok" : ""}>
                  Build Grove Sanctuary
                </li>
                <li className={harmonyReq.hasPopulation ? "ok" : ""}>
                  Population ≥ {HARMONY_THRESHOLDS.minPopulation}
                </li>
                <li className={harmonyReq.forestOk ? "ok" : ""}>
                  Forest cover ≥ {Math.round(HARMONY_THRESHOLDS.minForest * 100)}%
                </li>
                <li className={harmonyReq.strainOk ? "ok" : ""}>
                  Land Strain ≤ {HARMONY_THRESHOLDS.maxStrain}
                </li>
              </ul>
              <button
                type="button"
                className="primary harmony"
                disabled={!harmonyReq.ready}
                onClick={() => {
                  if (tryHarmonyVictory() && token) {
                    void saveToSlot(saveSlot ?? 1);
                  }
                }}
              >
                Claim Harmony
              </button>
            </section>
          </>
        )}
      </aside>
    </div>
  );
}
