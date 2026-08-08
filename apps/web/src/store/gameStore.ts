import { create } from "zustand";
import {
  advanceAge,
  createNewGame,
  placeBuilding,
  setPaused,
  setPriorities,
  startResearch,
  tick,
} from "../sim/engine";
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
  togglePause: () => void;
  stepTick: () => void;
  setSaveMeta: (slot: number, at: number) => void;
  setStatus: (msg: string | null) => void;
  dismissTutorial: () => void;
  getSavePayload: () => SavedGamePayload | null;
  /** Worker drop-off after a gather trip (carry-limited). */
  depositResources: (resource: ResourceId, amount: number) => void;
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
    set({
      state: createNewGame(),
      screen: "game",
      selectedBuilding: null,
      saveSlot: null,
      lastSavedAt: null,
      tutorialDismissed: false,
      statusMessage: "Stone Age begins. Gather wood and grow your people.",
    });
  },

  loadGame: (payload, slot) => {
    set({
      state: deserialize(payload),
      screen: "game",
      saveSlot: slot,
      selectedBuilding: null,
      lastSavedAt: Date.now(),
      statusMessage: `Loaded slot ${slot}`,
    });
  },

  selectBuilding: (id) => set({ selectedBuilding: id }),

  placeAt: (x, y) => {
    const { state, selectedBuilding } = get();
    if (!state || !selectedBuilding) return "Select a building first";
    const next = placeBuilding(state, selectedBuilding, x, y);
    if (next === state) return "Cannot place here";
    set({ state: next, statusMessage: `Placed ${selectedBuilding.replace("_", " ")}` });
    return null;
  },

  updatePriorities: (p) => {
    const { state } = get();
    if (!state) return;
    set({ state: setPriorities(state, p) });
  },

  research: (techId) => {
    const { state } = get();
    if (!state) return;
    const next = startResearch(state, techId);
    if (next === state) {
      set({ statusMessage: "Cannot start that research" });
      return;
    }
    set({ state: next, statusMessage: `Researching ${techId}` });
  },

  tryAgeUp: () => {
    const { state } = get();
    if (!state) return false;
    const next = advanceAge(state);
    if (next === state) return false;
    set({
      state: next,
      statusMessage: "Your people enter the Farming Age!",
    });
    return true;
  },

  togglePause: () => {
    const { state } = get();
    if (!state) return;
    set({ state: setPaused(state, !state.paused) });
  },

  stepTick: () => {
    const { state } = get();
    if (!state) return;
    set({ state: tick(state) });
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
}));
