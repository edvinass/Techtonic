import { create } from "zustand";
import { play } from "../audio/sfx";
import { AGES } from "../data/ages";
import {
  advanceAge,
  claimHarmonyVictory,
  createNewGame,
  harvestDeposit,
  placeBuilding,
  setPaused,
  setPriorities,
  startResearch,
  tick,
} from "../sim/engine";
import { resolveEventChoice } from "../sim/pressure";
import { deserialize, serialize, type SavedGamePayload } from "../sim/serialize";
import type { BuildingId, GameState, Priorities, ResourceId, TechId } from "../sim/types";

export type Screen = "auth" | "menu" | "game";

interface GameStore {
  screen: Screen;
  token: string | null;
  email: string | null;
  state: GameState | null;
  selectedBuilding: BuildingId | null;
  saveSlot: number | null;
  lastSavedAt: number | null;
  statusMessage: string | null;
  tutorialDismissed: boolean;

  setScreen: (screen: Screen) => void;
  setAuth: (token: string, email: string) => void;
  logout: () => void;
  newGame: () => void;
  loadGame: (payload: SavedGamePayload, slot: number) => void;
  selectBuilding: (id: BuildingId | null) => void;
  placeAt: (x: number, y: number) => string | null;
  updatePriorities: (p: Priorities) => void;
  research: (techId: TechId) => void;
  tryAgeUp: () => boolean;
  tryHarmonyVictory: () => boolean;
  togglePause: () => void;
  stepTick: () => void;
  setSaveMeta: (slot: number, at: number) => void;
  setStatus: (msg: string | null) => void;
  dismissTutorial: () => void;
  getSavePayload: () => SavedGamePayload | null;
  /** Worker drop-off after a gather trip (carry-limited). */
  depositResources: (resource: ResourceId, amount: number) => void;
  /** Deplete a map deposit; returns amount actually taken. */
  harvestDeposit: (gx: number, gy: number, amount: number) => number;
  resolveEvent: (choiceIndex: 0 | 1) => void;
}

const TOKEN_KEY = "techtonic_token";
const EMAIL_KEY = "techtonic_email";

function readStoredAuth(): { token: string | null; email: string | null } {
  try {
    return {
      token: localStorage.getItem(TOKEN_KEY),
      email: localStorage.getItem(EMAIL_KEY),
    };
  } catch {
    return { token: null, email: null };
  }
}

const stored = readStoredAuth();

export const useGameStore = create<GameStore>((set, get) => ({
  screen: stored.token ? "menu" : "auth",
  token: stored.token,
  email: stored.email,
  state: null,
  selectedBuilding: null,
  saveSlot: null,
  lastSavedAt: null,
  statusMessage: null,
  tutorialDismissed: false,

  setScreen: (screen) => set({ screen }),

  setAuth: (token, email) => {
    localStorage.setItem(TOKEN_KEY, token);
    localStorage.setItem(EMAIL_KEY, email);
    set({ token, email, screen: "menu" });
  },

  logout: () => {
    localStorage.removeItem(TOKEN_KEY);
    localStorage.removeItem(EMAIL_KEY);
    set({
      token: null,
      email: null,
      screen: "auth",
      state: null,
      saveSlot: null,
      selectedBuilding: null,
    });
  },

  newGame: () => {
    play("new_game");
    set({
      state: createNewGame(),
      screen: "game",
      selectedBuilding: null,
      saveSlot: null,
      lastSavedAt: null,
      tutorialDismissed: false,
      statusMessage:
        "Stone Age begins. Forests are finite — Land Strain rises with every axe swing. Fortify homes before the raids.",
    });
  },

  loadGame: (payload, slot) => {
    play("load_game");
    set({
      state: deserialize(payload),
      screen: "game",
      saveSlot: slot,
      selectedBuilding: null,
      lastSavedAt: Date.now(),
      statusMessage: `Loaded slot ${slot}`,
    });
  },

  selectBuilding: (id) => {
    if (id) play("ui");
    set({ selectedBuilding: id });
  },

  placeAt: (x, y) => {
    const { state, selectedBuilding } = get();
    if (!state || !selectedBuilding) return "Select a building first";
    const next = placeBuilding(state, selectedBuilding, x, y);
    if (next === state) {
      play("place_fail");
      return "Cannot place here";
    }
    play("place");
    set({ state: next, statusMessage: `Placed ${selectedBuilding.replace("_", " ")}` });
    return null;
  },

  updatePriorities: (p) => {
    const { state } = get();
    if (!state) return;
    play("ui");
    set({ state: setPriorities(state, p) });
  },

  research: (techId) => {
    const { state } = get();
    if (!state) return;
    const next = startResearch(state, techId);
    if (next === state) {
      play("place_fail");
      set({ statusMessage: "Cannot start that research" });
      return;
    }
    play("research_start");
    set({ state: next, statusMessage: `Researching ${techId}` });
  },

  tryAgeUp: () => {
    const { state } = get();
    if (!state) return false;
    const next = advanceAge(state);
    if (next === state) return false;
    const ageName = AGES[next.age]?.name ?? next.age;
    const won = next.outcome === "victory";
    if (won) play("victory_ascent");
    else play("age_up");
    set({
      state: next,
      statusMessage: won
        ? "Ascent victory — your people reach the stars!"
        : `Your people enter the ${ageName}!`,
    });
    return true;
  },

  tryHarmonyVictory: () => {
    const { state } = get();
    if (!state) return false;
    const next = claimHarmonyVictory(state);
    if (next === state) return false;
    play("victory_harmony");
    set({
      state: next,
      statusMessage: "Harmony victory — the living world endures!",
    });
    return true;
  },

  togglePause: () => {
    const { state } = get();
    if (!state) return;
    play(state.paused ? "resume" : "pause");
    set({ state: setPaused(state, !state.paused) });
  },

  stepTick: () => {
    const { state } = get();
    if (!state || state.pressure.pendingEventId || state.outcome !== "playing") return;
    const prev = state;
    const next = tick(state);
    const banner = next.pressure.lastBanner;
    if (banner) next.pressure.lastBanner = null;
    let status = banner;
    playTickSfx(prev, next, banner);
    if (next.outcome === "victory") {
      status =
        next.stats.victoryKind === "harmony"
          ? "Harmony victory — the living world endures!"
          : "Ascent victory — your people reach the stars!";
    }
    if (next.outcome === "defeat") status = "Defeat — the settlement has fallen.";
    set({
      state: next,
      ...(status ? { statusMessage: status } : {}),
    });
  },

  setSaveMeta: (slot, at) => set({ saveSlot: slot, lastSavedAt: at }),

  setStatus: (msg) => set({ statusMessage: msg }),

  dismissTutorial: () => set({ tutorialDismissed: true }),

  getSavePayload: () => {
    const { state } = get();
    if (!state) return null;
    return serialize(state);
  },

  depositResources: (resource, amount) => {
    const { state } = get();
    if (!state || amount <= 0) return;
    const next = structuredClone(state);
    next.resources[resource] += amount;
    set({ state: next });
  },

  harvestDeposit: (gx, gy, amount) => {
    const { state } = get();
    if (!state || amount <= 0) return 0;
    // Mutate live map stock (Phaser reads getState each frame; tick() clones later)
    const taken = harvestDeposit(state, gx, gy, amount);
    return taken;
  },

  resolveEvent: (choiceIndex) => {
    const { state } = get();
    if (!state?.pressure.pendingEventId) return;
    play("ui");
    const next = resolveEventChoice(state, choiceIndex);
    const banner = next.pressure.lastBanner;
    if (banner) next.pressure.lastBanner = null;
    set({
      state: next,
      statusMessage: banner ?? "Decision made.",
    });
  },
}));

/** Diff tick transitions and fire one-shot SFX (keeps sim/ pure). */
function playTickSfx(prev: GameState, next: GameState, banner: string | null): void {
  if (next.outcome === "defeat" && prev.outcome === "playing") {
    play("defeat");
    return;
  }
  if (next.outcome === "victory" && prev.outcome === "playing") {
    play(next.stats.victoryKind === "harmony" ? "victory_harmony" : "victory_ascent");
    return;
  }

  if (next.pressure.pendingEventId && !prev.pressure.pendingEventId) {
    play("event");
  }

  if (
    prev.pressure.raidWarningTicks === 0 &&
    next.pressure.raidWarningTicks > 0
  ) {
    play("raid_warn");
  }

  if (
    prev.pressure.raidWarningTicks > 0 &&
    next.pressure.raidWarningTicks === 0 &&
    banner
  ) {
    const win = /driven off|Scavenged/i.test(banner);
    play(win ? "raid_win" : "raid_lose");
  }

  if (next.pressure.season !== prev.pressure.season) {
    play("season");
  }

  if (next.population.count > prev.population.count) {
    play("pop_grow");
  }

  if (next.research.unlocked.length > prev.research.unlocked.length) {
    play("research_done");
  }

  const prevBuilding = new Map(prev.buildings.map((b) => [b.id, b.progress]));
  for (const b of next.buildings) {
    const before = prevBuilding.get(b.id);
    if (before != null && before < 1 && b.progress >= 1) {
      play("building_done");
      break;
    }
  }
}
