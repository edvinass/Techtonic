import { describe, expect, it } from "vitest";
import { createNewGame, tick } from "./engine";
import { deserialize, serialize } from "./serialize";

describe("serialize", () => {
  it("round-trips game state", () => {
    let state = createNewGame(99);
    state = tick(state);
    state = tick(state);
    const payload = serialize(state);
    const restored = deserialize(payload);
    expect(restored.tick).toBe(state.tick);
    expect(restored.age).toBe(state.age);
    expect(restored.resources).toEqual(state.resources);
    expect(restored.buildings).toEqual(state.buildings);
    expect(restored.map.tiles.length).toBe(state.map.tiles.length);
  });
});
