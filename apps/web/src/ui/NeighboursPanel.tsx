import { useState, type CSSProperties } from "react";
import { NEIGHBOURS, NEIGHBOUR_LIST, STANCE_INFO } from "../data/neighbours";
import { RESOURCES } from "../data/resources";
import {
  canOpenRoute,
  canSendGift,
  caravanCycleTicks,
  giftAmount,
  routeCapacity,
  routeRate,
  stanceFor,
  tradeStaffRatio,
  tradeWorkers,
} from "../sim/diplomacy";
import type { GameState, NeighbourId, ResourceId } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { ResourceIcon } from "./ResourceIcon";

const VOLUME_LABELS = ["", "Light", "Standard", "Heavy"];

function standingPct(standing: number): number {
  return ((standing + 100) / 200) * 100;
}

interface Props {
  state: GameState;
}

/** Diplomacy and caravan management for the three peoples of the valley. */
export function NeighboursPanel({ state }: Props) {
  const openTradeRoute = useGameStore((s) => s.openTradeRoute);
  const closeTradeRoute = useGameStore((s) => s.closeTradeRoute);
  const setTradeRouteWeight = useGameStore((s) => s.setTradeRouteWeight);
  const giftNeighbour = useGameStore((s) => s.giftNeighbour);
  const openLibrary = useGameStore((s) => s.openLibrary);

  const [draftTarget, setDraftTarget] = useState<NeighbourId>("reed_folk");
  const [draftGive, setDraftGive] = useState<ResourceId>("wood");
  const [draftWeight, setDraftWeight] = useState(2);

  const knowsTrade = state.research.unlocked.includes("trade");
  const capacity = routeCapacity(state);
  const routes = state.diplomacy.routes;
  const crew = tradeWorkers(state);
  const staff = tradeStaffRatio(state);

  const targetDef = NEIGHBOURS[draftTarget];
  const draftTake = targetDef.surplus[0];
  const draftCheck = canOpenRoute(state, draftTarget, draftGive, draftTake, draftWeight);
  const draftRate = routeRate(state, draftTarget, draftGive, draftTake, draftWeight);

  return (
    <section className="chrome-panel neighbours-panel">
      <h3>Neighbours</h3>
      <p className="muted panel-hint">
        Three peoples share this valley. Trade with them, buy them off, or hold the walls.{" "}
        <button
          type="button"
          className="text-link"
          onClick={() => openLibrary("diplomacy-overview")}
        >
          How standing works
        </button>
      </p>

      <div className="neighbour-list">
        {NEIGHBOUR_LIST.map((def) => {
          const n = state.diplomacy.neighbours.find((x) => x.id === def.id);
          if (!n) return null;
          const stance = stanceFor(n.standing);
          const info = STANCE_INFO[stance];
          const accent = `#${def.color.toString(16).padStart(6, "0")}`;
          return (
            <div
              key={def.id}
              className="neighbour-card"
              style={{ "--neighbour-accent": accent } as CSSProperties}
            >
              <div className="neighbour-head">
                <div>
                  <strong>{def.name}</strong>
                  <span className="neighbour-epithet">{def.epithet}</span>
                </div>
                <span className="stance-pill" style={{ color: info.color }}>
                  {info.label}
                </span>
              </div>

              <div className="neighbour-meter" title="Standing: −100 blood feud to 100 sworn allies">
                <span className="neighbour-meter-label">Standing</span>
                <div className="neighbour-meter-track">
                  <div
                    className="neighbour-meter-fill standing"
                    style={{ width: `${standingPct(n.standing)}%` }}
                  />
                </div>
                <em>{Math.round(n.standing)}</em>
              </div>
              <div className="neighbour-meter" title="Grievance — at full they demand tribute, then raid">
                <span className="neighbour-meter-label">Grievance</span>
                <div className="neighbour-meter-track">
                  <div
                    className="neighbour-meter-fill grievance"
                    style={{ width: `${Math.round(n.aggression * 100)}%` }}
                  />
                </div>
                <em>{Math.round(n.aggression * 100)}%</em>
              </div>

              <p className="neighbour-trade-note">
                <span>
                  Spares{" "}
                  {def.surplus.map((r) => (
                    <span key={r} className="goods-chip" title={RESOURCES[r].label}>
                      <ResourceIcon id={r} size={12} />
                    </span>
                  ))}
                </span>
                <span>
                  Wants{" "}
                  {def.wants.map((r) => (
                    <span key={r} className="goods-chip" title={RESOURCES[r].label}>
                      <ResourceIcon id={r} size={12} />
                    </span>
                  ))}
                </span>
              </p>

              <div className="neighbour-gifts">
                <span className="muted">Gift</span>
                {def.wants.map((r) => {
                  const check = canSendGift(state, def.id, r);
                  return (
                    <button
                      key={r}
                      type="button"
                      className="gift-btn"
                      disabled={!check.ok}
                      title={check.ok ? `Send ${giftAmount(r)} ${RESOURCES[r].label}` : check.reason}
                      onClick={() => giftNeighbour(def.id, r)}
                    >
                      <ResourceIcon id={r} size={12} />
                      {giftAmount(r)}
                    </button>
                  );
                })}
                {n.giftCooldown > 0 && (
                  <span className="muted gift-cooldown">{n.giftCooldown}s</span>
                )}
              </div>
            </div>
          );
        })}
      </div>

      <h4 className="neighbour-subhead">
        Caravan routes <span className="muted">{routes.length} / {capacity}</span>
      </h4>

      {!knowsTrade && (
        <p className="worker-hint">Research Trade, then build a Trade Post to open routes.</p>
      )}
      {knowsTrade && capacity === 0 && (
        <p className="worker-hint">Build a Trade Post — each one hosts a caravan route.</p>
      )}
      {routes.length > 0 && crew === 0 && (
        <p className="worker-hint">
          No Trade workers. Assign some in the Work tab or the caravans stay parked.
        </p>
      )}

      {routes.map((route) => {
        const def = NEIGHBOURS[route.neighbourId];
        const rate = routeRate(state, route.neighbourId, route.give, route.take, route.weight);
        const cycle = caravanCycleTicks(state, route);
        return (
          <div key={route.id} className={`route-card${route.suspended ? " suspended" : ""}`}>
            <div className="route-head">
              <strong>{def.name}</strong>
              <button
                type="button"
                className="route-close"
                title="Close this route (−4 standing)"
                onClick={() => closeTradeRoute(route.id)}
              >
                ✕
              </button>
            </div>
            <div className="route-flow">
              <span className="route-side out">
                <ResourceIcon id={route.give} size={14} />
                {(rate.give * Math.max(staff, 0)).toFixed(2)}/s
              </span>
              <span className="route-arrow">→</span>
              <span className="route-side in">
                <ResourceIcon id={route.take} size={14} />
                {(rate.take * Math.max(staff, 0)).toFixed(2)}/s
              </span>
            </div>
            <div className="route-cycle" title={`Caravan round trip: ${cycle}s`}>
              <div className="progress-track">
                <div
                  className="progress-fill"
                  style={{ width: `${Math.min(100, route.progress * 100)}%` }}
                />
              </div>
              <span className="muted">
                {route.suspended
                  ? "Suspended"
                  : `carrying ${route.pending.toFixed(1)} ${RESOURCES[route.take].label}`}
              </span>
            </div>
            <div className="route-volume">
              <span className="muted">{VOLUME_LABELS[route.weight]}</span>
              <div className="worker-stepper">
                <button
                  type="button"
                  aria-label="Smaller caravan"
                  disabled={route.weight <= 1}
                  onClick={() => setTradeRouteWeight(route.id, route.weight - 1)}
                >
                  −
                </button>
                <em className="worker-count">{route.weight}</em>
                <button
                  type="button"
                  aria-label="Larger caravan"
                  disabled={route.weight >= 3}
                  onClick={() => setTradeRouteWeight(route.id, route.weight + 1)}
                >
                  +
                </button>
              </div>
            </div>
          </div>
        );
      })}

      {knowsTrade && capacity > routes.length && (
        <div className="route-draft">
          <p className="muted panel-hint">New route</p>
          <label className="route-field">
            <span>With</span>
            <select
              value={draftTarget}
              onChange={(e) => setDraftTarget(e.target.value as NeighbourId)}
            >
              {NEIGHBOUR_LIST.map((def) => (
                <option key={def.id} value={def.id}>
                  {def.name}
                </option>
              ))}
            </select>
          </label>
          <label className="route-field">
            <span>Send</span>
            <select
              value={draftGive}
              onChange={(e) => setDraftGive(e.target.value as ResourceId)}
            >
              {(Object.keys(RESOURCES) as ResourceId[])
                .filter((r) => r !== draftTake)
                .map((r) => (
                  <option key={r} value={r}>
                    {RESOURCES[r].label}
                    {targetDef.wants.includes(r) ? " (wanted)" : ""}
                  </option>
                ))}
            </select>
          </label>
          <label className="route-field">
            <span>Volume</span>
            <div className="worker-stepper">
              <button
                type="button"
                aria-label="Smaller caravan"
                disabled={draftWeight <= 1}
                onClick={() => setDraftWeight(draftWeight - 1)}
              >
                −
              </button>
              <em className="worker-count">{VOLUME_LABELS[draftWeight]}</em>
              <button
                type="button"
                aria-label="Larger caravan"
                disabled={draftWeight >= 3}
                onClick={() => setDraftWeight(draftWeight + 1)}
              >
                +
              </button>
            </div>
          </label>
          <p className="route-quote">
            <ResourceIcon id={draftGive} size={13} /> {draftRate.give.toFixed(2)}/s
            <span className="route-arrow"> → </span>
            <ResourceIcon id={draftTake} size={13} /> {draftRate.take.toFixed(2)}/s
          </p>
          <button
            type="button"
            className="primary"
            disabled={!draftCheck.ok}
            title={draftCheck.ok ? undefined : draftCheck.reason}
            onClick={() => openTradeRoute(draftTarget, draftGive, draftTake, draftWeight)}
          >
            {draftCheck.ok ? "Open route" : draftCheck.reason}
          </button>
        </div>
      )}
    </section>
  );
}
