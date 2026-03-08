import { describe, it, expect, vi } from "vitest";
import { fromPairs } from "../src/helpers/utils.js";
import createClues from "../src/helpers/createClues.js";
import createCells from "../src/helpers/createCells.js";
import validateClues from "../src/helpers/validateClues.js";
import getSecondarilyFocusedCells from "../src/helpers/getSecondarilyFocusedCells.js";
import getCellAfterDiff from "../src/helpers/getCellAfterDiff.js";

// Sample mini crossword data
const miniData = [
  { clue: "The 1% of 1% milk", answer: "FAT", direction: "across", x: 2, y: 0 },
  { clue: "Flicker of light", answer: "GLINT", direction: "across", x: 0, y: 1 },
  { clue: "Really neat", answer: "NIFTY", direction: "across", x: 0, y: 2 },
  { clue: "\"__ we meet again\"", answer: "UNTIL", direction: "across", x: 0, y: 3 },
  { clue: "It's way over your head", answer: "SKY", direction: "across", x: 0, y: 4 },
  { clue: "Point bonus in Scrabble", answer: "FIFTY", direction: "down", x: 2, y: 0 },
  { clue: "Opposite of pro-", answer: "ANTI", direction: "down", x: 3, y: 0 },
  { clue: "Texter's \"gotta run\"", answer: "TTYL", direction: "down", x: 4, y: 0 },
  { clue: "Migratory antelopes", answer: "GNUS", direction: "down", x: 0, y: 1 },
  { clue: "Clickable part of a webpage", answer: "LINK", direction: "down", x: 1, y: 1 },
];

// --- fromPairs ---
describe("fromPairs", () => {
  it("converts array of pairs to object", () => {
    expect(fromPairs([["a", 1], ["b", 2]])).toEqual({ a: 1, b: 2 });
  });

  it("returns empty object for empty array", () => {
    expect(fromPairs([])).toEqual({});
  });

  it("last value wins for duplicate keys", () => {
    expect(fromPairs([["a", 1], ["a", 2]])).toEqual({ a: 2 });
  });
});

// --- createClues ---
describe("createClues", () => {
  let clues;

  beforeEach(() => {
    clues = createClues(miniData);
  });

  it("returns an array of clue objects", () => {
    expect(Array.isArray(clues)).toBe(true);
    expect(clues.length).toBe(miniData.length);
  });

  it("sorts clues by direction (across first) then by number", () => {
    const acrossClues = clues.filter((c) => c.direction === "across");
    const downClues = clues.filter((c) => c.direction === "down");
    // across should come before down
    const lastAcrossIndex = clues.indexOf(acrossClues[acrossClues.length - 1]);
    const firstDownIndex = clues.indexOf(downClues[0]);
    expect(lastAcrossIndex).toBeLessThan(firstDownIndex);
  });

  it("assigns incrementing clue numbers based on position", () => {
    const numbers = clues.map((c) => c.number);
    // numbers should be positive integers
    numbers.forEach((n) => {
      expect(n).toBeGreaterThan(0);
      expect(Number.isInteger(n)).toBe(true);
    });
  });

  it("shares clue numbers for clues starting at the same position", () => {
    // FAT across and FIFTY down both start at (2,0)
    const fatClue = clues.find((c) => c.answer === "FAT");
    const fiftyClue = clues.find((c) => c.answer === "FIFTY");
    expect(fatClue.number).toBe(fiftyClue.number);
  });

  it("generates cells for each letter in the answer", () => {
    clues.forEach((clue) => {
      expect(clue.cells.length).toBe(clue.answer.length);
    });
  });

  it("adjusts coordinates to 0-based", () => {
    // our test data is already 0-based, so min should remain 0
    const allCells = clues.flatMap((c) => c.cells);
    const minX = Math.min(...allCells.map((c) => c.x));
    const minY = Math.min(...allCells.map((c) => c.y));
    expect(minX).toBe(0);
    expect(minY).toBe(0);
  });

  it("handles 1-based input data", () => {
    const oneBasedData = miniData.map((d) => ({ ...d, x: d.x + 1, y: d.y + 1 }));
    const result = createClues(oneBasedData);
    const allCells = result.flatMap((c) => c.cells);
    const minX = Math.min(...allCells.map((c) => c.x));
    const minY = Math.min(...allCells.map((c) => c.y));
    expect(minX).toBe(0);
    expect(minY).toBe(0);
  });

  it("assigns an index to each clue", () => {
    clues.forEach((clue, i) => {
      expect(clue.index).toBe(i);
    });
  });

  it("creates cells with correct across positioning", () => {
    const glintClue = clues.find((c) => c.answer === "GLINT");
    glintClue.cells.forEach((cell, i) => {
      expect(cell.x).toBe(i); // across: x increments
      expect(cell.y).toBe(1); // y stays the same
    });
  });

  it("creates cells with correct down positioning", () => {
    const gnusClue = clues.find((c) => c.answer === "GNUS");
    gnusClue.cells.forEach((cell, i) => {
      expect(cell.x).toBe(0); // x stays the same
      expect(cell.y).toBe(1 + i); // down: y increments
    });
  });
});

// --- createCells ---
describe("createCells", () => {
  let clues;
  let cells;

  beforeEach(() => {
    clues = createClues(miniData);
    cells = createCells(clues);
  });

  it("returns an array of unique cells", () => {
    const ids = cells.map((c) => c.id);
    const uniqueIds = new Set(ids);
    expect(ids.length).toBe(uniqueIds.size);
  });

  it("assigns sequential indices", () => {
    cells.forEach((cell, i) => {
      expect(cell.index).toBe(i);
    });
  });

  it("consolidates clue numbers for intersecting cells", () => {
    // Cell at position (2,1) should be in both "GLINT" across (clue 3 in across) and "FIFTY" down
    const cell = cells.find((c) => c.id === "2-1");
    expect(cell.clueNumbers).toHaveProperty("across");
    expect(cell.clueNumbers).toHaveProperty("down");
  });

  it("deduplicates cells at same position", () => {
    // GLINT across and FIFTY down share position (2,1)
    // should only have one cell there
    const cellsAt2_1 = cells.filter((c) => c.id === "2-1");
    expect(cellsAt2_1.length).toBe(1);
  });

  it("sorts cells by position (y then x)", () => {
    for (let i = 1; i < cells.length; i++) {
      const prev = cells[i - 1];
      const curr = cells[i];
      const prevPos = prev.y * 100 + prev.x;
      const currPos = curr.y * 100 + curr.x;
      expect(currPos).toBeGreaterThanOrEqual(prevPos);
    }
  });

  it("all cells have empty initial value", () => {
    cells.forEach((cell) => {
      expect(cell.value).toBe("");
    });
  });

  it("all answers are uppercased", () => {
    cells.forEach((cell) => {
      expect(cell.answer).toBe(cell.answer.toUpperCase());
    });
  });
});

// --- validateClues ---
describe("validateClues", () => {
  let clues;

  beforeEach(() => {
    clues = createClues(miniData);
  });

  it("returns true for valid clues", () => {
    expect(validateClues(clues)).toBe(true);
  });

  it("returns false when a clue is missing a required property", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const badData = [{ ...miniData[0], clue: 123 }];
    const badClues = createClues(badData);
    expect(validateClues(badClues)).toBe(false);
    spy.mockRestore();
  });

  it("returns false when cells at same position have different answers", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    // Create conflicting clues manually
    const conflictingClues = [
      {
        clue: "Test1", answer: "AB", direction: "across", x: 0, y: 0,
        cells: [
          { id: "0-0", answer: "A" },
          { id: "1-0", answer: "B" },
        ],
      },
      {
        clue: "Test2", answer: "XB", direction: "down", x: 0, y: 0,
        cells: [
          { id: "0-0", answer: "X" }, // conflicts with "A"
          { id: "0-1", answer: "B" },
        ],
      },
    ];
    expect(validateClues(conflictingClues)).toBe(false);
    spy.mockRestore();
  });
});

// --- getSecondarilyFocusedCells ---
describe("getSecondarilyFocusedCells", () => {
  let cells;

  beforeEach(() => {
    const clues = createClues(miniData);
    cells = createCells(clues);
  });

  it("returns array of cell indices in the same row when focused across", () => {
    const focusedCell = cells.find((c) => c.id === "0-1"); // first cell of GLINT
    const result = getSecondarilyFocusedCells({
      cells,
      focusedDirection: "across",
      focusedCell,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // all highlighted cells should be in row 1
    result.forEach((idx) => {
      expect(cells[idx].y).toBe(1);
    });
  });

  it("returns array of cell indices in the same column when focused down", () => {
    const focusedCell = cells.find((c) => c.id === "2-0"); // first cell of FIFTY down
    const result = getSecondarilyFocusedCells({
      cells,
      focusedDirection: "down",
      focusedCell,
    });
    expect(Array.isArray(result)).toBe(true);
    expect(result.length).toBeGreaterThan(0);
    // all highlighted cells should be in column 2
    result.forEach((idx) => {
      expect(cells[idx].x).toBe(2);
    });
  });

  it("includes the focused cell itself", () => {
    const focusedCell = cells.find((c) => c.id === "0-1");
    const result = getSecondarilyFocusedCells({
      cells,
      focusedDirection: "across",
      focusedCell,
    });
    expect(result).toContain(focusedCell.index);
  });
});

// --- getCellAfterDiff ---
describe("getCellAfterDiff", () => {
  let cells;

  beforeEach(() => {
    const clues = createClues(miniData);
    cells = createCells(clues);
  });

  it("returns the next cell to the right when moving across +1", () => {
    const focusedCell = cells.find((c) => c.id === "0-1");
    const result = getCellAfterDiff({
      diff: 1,
      cells,
      direction: "across",
      focusedCell,
    });
    expect(result).toBeDefined();
    expect(result.x).toBe(focusedCell.x + 1);
    expect(result.y).toBe(focusedCell.y);
  });

  it("returns the next cell below when moving down +1", () => {
    const focusedCell = cells.find((c) => c.id === "2-0");
    const result = getCellAfterDiff({
      diff: 1,
      cells,
      direction: "down",
      focusedCell,
    });
    expect(result).toBeDefined();
    expect(result.y).toBe(focusedCell.y + 1);
    expect(result.x).toBe(focusedCell.x);
  });

  it("returns the previous cell when moving with diff -1", () => {
    const focusedCell = cells.find((c) => c.id === "2-1");
    const result = getCellAfterDiff({
      diff: -1,
      cells,
      direction: "across",
      focusedCell,
    });
    expect(result).toBeDefined();
    expect(result.x).toBe(focusedCell.x - 1);
  });

  it("returns undefined when no cell exists in that direction", () => {
    const focusedCell = cells.find((c) => c.id === "0-1"); // leftmost in row 1
    const result = getCellAfterDiff({
      diff: -1,
      cells,
      direction: "across",
      focusedCell,
    });
    expect(result).toBeUndefined();
  });
});
