import { useEffect, useMemo, useState } from "react";
import {
  LIBRARY_CATEGORIES,
  getLibraryEntry,
  libraryEntriesFor,
  type LibraryCategoryId,
} from "../data/library";
import { play } from "../audio/sfx";
import { useGameStore } from "../store/gameStore";

export function LibraryModal() {
  const open = useGameStore((s) => s.libraryOpen);
  const focusId = useGameStore((s) => s.libraryFocusId);
  const closeLibrary = useGameStore((s) => s.closeLibrary);

  const [category, setCategory] = useState<LibraryCategoryId>("basics");
  const [entryId, setEntryId] = useState<string>("basics-goal");

  useEffect(() => {
    if (!open) return;
    if (focusId) {
      const entry = getLibraryEntry(focusId);
      if (entry) {
        setCategory(entry.category);
        setEntryId(entry.id);
        return;
      }
    }
    setCategory("basics");
    setEntryId("basics-goal");
  }, [open, focusId]);

  useEffect(() => {
    if (!open) return;
    function onKey(e: KeyboardEvent) {
      if (e.key === "Escape") {
        e.stopPropagation();
        closeLibrary();
      }
    }
    window.addEventListener("keydown", onKey, true);
    return () => window.removeEventListener("keydown", onKey, true);
  }, [open, closeLibrary]);

  const entries = useMemo(() => libraryEntriesFor(category), [category]);
  const active = getLibraryEntry(entryId) ?? entries[0];
  const catMeta = LIBRARY_CATEGORIES.find((c) => c.id === category);

  if (!open) return null;

  return (
    <div
      className="library-backdrop"
      role="presentation"
      onMouseDown={(e) => {
        if (e.target === e.currentTarget) closeLibrary();
      }}
    >
      <div
        className="library-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="library-title"
      >
        <header className="library-head">
          <div>
            <p className="eyebrow">Reference</p>
            <h2 id="library-title">Game library</h2>
            <p className="lede library-lede">
              Read what every meter, job, building, and choice actually does.
            </p>
          </div>
          <button
            type="button"
            className="library-close"
            title="Close (Esc)"
            onClick={() => {
              play("ui");
              closeLibrary();
            }}
          >
            ✕
          </button>
        </header>

        <div className="library-body">
          <nav className="library-cats" aria-label="Library categories">
            {LIBRARY_CATEGORIES.map((c) => (
              <button
                key={c.id}
                type="button"
                className={category === c.id ? "active" : ""}
                onClick={() => {
                  play("ui");
                  setCategory(c.id);
                  const first = libraryEntriesFor(c.id)[0];
                  if (first) setEntryId(first.id);
                }}
              >
                {c.label}
              </button>
            ))}
          </nav>

          <div className="library-list-pane">
            <p className="muted library-cat-blurb">{catMeta?.blurb}</p>
            <ul className="library-list">
              {entries.map((e) => (
                <li key={e.id}>
                  <button
                    type="button"
                    className={active?.id === e.id ? "active" : ""}
                    onClick={() => {
                      play("ui");
                      setEntryId(e.id);
                    }}
                  >
                    <strong>{e.title}</strong>
                    <span>{e.summary}</span>
                  </button>
                </li>
              ))}
            </ul>
          </div>

          <article className="library-detail" aria-live="polite">
            {active ? (
              <>
                <p className="library-detail-cat">
                  {LIBRARY_CATEGORIES.find((c) => c.id === active.category)?.label}
                </p>
                <h3>{active.title}</h3>
                <div className="library-detail-body">
                  {active.body.split("\n").map((line, i) =>
                    line.trim() ? <p key={i}>{line}</p> : <br key={i} />,
                  )}
                </div>
              </>
            ) : (
              <p className="muted">Pick a topic from the list.</p>
            )}
          </article>
        </div>
      </div>
    </div>
  );
}
