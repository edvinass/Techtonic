import { NEIGHBOURS } from "../data/neighbours";
import { RESOURCES } from "../data/resources";
import type { ResourceId } from "../sim/types";
import { useGameStore } from "../store/gameStore";
import { ResourceIcon } from "./ResourceIcon";

/** A neighbour's tribute ultimatum. Pausing until answered is the point. */
export function DemandModal() {
  const state = useGameStore((s) => s.state);
  const answerDemand = useGameStore((s) => s.answerDemand);
  const openLibrary = useGameStore((s) => s.openLibrary);

  const demand = state?.diplomacy.demand;
  if (!state || !demand) return null;
  const def = NEIGHBOURS[demand.neighbourId];
  const entries = Object.entries(demand.cost) as [ResourceId, number][];
  const affordable = entries.every(([k, v]) => state.resources[k] >= v);

  return (
    <div className="event-backdrop">
      <div
        className="event-modal demand-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="demand-title"
      >
        <p className="eyebrow">Ultimatum</p>
        <h2 id="demand-title">{def.name} demand tribute</h2>
        <p className="lede">{demand.text}</p>
        <div className="demand-cost">
          {entries.map(([k, v]) => (
            <span key={k} className={`cost-item${state.resources[k] < v ? " short" : ""}`}>
              <ResourceIcon id={k} size={14} />
              {v} {RESOURCES[k].label}
            </span>
          ))}
        </div>
        <div className="event-choices">
          <button
            type="button"
            className="event-choice"
            disabled={!affordable}
            onClick={() => answerDemand(true)}
          >
            <strong>Pay the tribute</strong>
            <span className="event-choice-hint">
              {affordable
                ? "Expensive, but it buys real quiet"
                : "You do not have the goods"}
            </span>
            <ul className="event-effect-list">
              <li>+14 standing with the {def.name}</li>
              <li>Their grievance mostly drains away</li>
              <li>No raid from them for a long while</li>
            </ul>
          </button>
          <button type="button" className="event-choice" onClick={() => answerDemand(false)}>
            <strong>Send them away</strong>
            <span className="event-choice-hint">Keep the goods and take the war</span>
            <ul className="event-effect-list">
              <li>−10 standing with the {def.name}</li>
              <li>Their grievance goes to full</li>
              <li>A warband arrives within seconds</li>
            </ul>
          </button>
        </div>
        <div className="event-footer">
          <button
            type="button"
            className="event-library-link"
            onClick={() => openLibrary("diplomacy-demands")}
          >
            Read about tribute
          </button>
          <p className="muted event-pause-note">Game paused until you answer.</p>
        </div>
      </div>
    </div>
  );
}
