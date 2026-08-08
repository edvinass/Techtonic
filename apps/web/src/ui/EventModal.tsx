import { getEventDef } from "../data/events";
import { useGameStore } from "../store/gameStore";

export function EventModal() {
  const state = useGameStore((s) => s.state);
  const resolveEvent = useGameStore((s) => s.resolveEvent);

  const eventId = state?.pressure.pendingEventId;
  if (!eventId) return null;
  const def = getEventDef(eventId);
  if (!def) return null;

  return (
    <div className="event-backdrop">
      <div className="event-modal" role="dialog" aria-modal="true" aria-labelledby="event-title">
        <p className="eyebrow">Challenge</p>
        <h2 id="event-title">{def.title}</h2>
        <p className="lede">{def.text}</p>
        <div className="event-choices">
          {def.choices.map((choice, i) => (
            <button
              key={choice.label}
              type="button"
              className="event-choice"
              onClick={() => resolveEvent(i as 0 | 1)}
            >
              <strong>{choice.label}</strong>
              <span>{choice.hint}</span>
            </button>
          ))}
        </div>
        <p className="muted event-pause-note">Game paused until you choose.</p>
      </div>
    </div>
  );
}
