import { formatEventEffect, getEventDef } from "../data/events";
import { useGameStore } from "../store/gameStore";

export function EventModal() {
  const state = useGameStore((s) => s.state);
  const resolveEvent = useGameStore((s) => s.resolveEvent);
  const openLibrary = useGameStore((s) => s.openLibrary);

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
        <p className="muted event-explain">
          Pick one path. Effects below are exact — there is no hidden option.
        </p>
        <div className="event-choices">
          {def.choices.map((choice, i) => {
            const effects = formatEventEffect(choice.effect);
            return (
              <button
                key={choice.label}
                type="button"
                className="event-choice"
                onClick={() => resolveEvent(i as 0 | 1)}
              >
                <strong>{choice.label}</strong>
                <span className="event-choice-hint">{choice.hint}</span>
                {effects.length > 0 && (
                  <ul className="event-effect-list">
                    {effects.map((line) => (
                      <li key={line}>{line}</li>
                    ))}
                  </ul>
                )}
              </button>
            );
          })}
        </div>
        <div className="event-footer">
          <button
            type="button"
            className="event-library-link"
            onClick={() => openLibrary(`event-${def.id}`)}
          >
            Read about challenges
          </button>
          <p className="muted event-pause-note">Game paused until you choose.</p>
        </div>
      </div>
    </div>
  );
}
