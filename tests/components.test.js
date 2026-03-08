import { describe, it, expect, beforeEach } from "vitest";
import { render, screen, fireEvent } from "@testing-library/svelte";
import Crossword from "../src/Crossword.svelte";
import Toolbar from "../src/Toolbar.svelte";

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

describe("Crossword component", () => {
  it("renders the crossword grid", () => {
    const { container } = render(Crossword, { props: { data: miniData } });
    expect(container.querySelector(".svelte-crossword")).toBeTruthy();
  });

  it("renders an SVG puzzle", () => {
    const { container } = render(Crossword, { props: { data: miniData } });
    expect(container.querySelector("svg")).toBeTruthy();
  });

  it("renders the correct number of cells", () => {
    const { container } = render(Crossword, { props: { data: miniData } });
    const cellGroups = container.querySelectorAll("g.cell");
    // Unique cells from all clues in the mini crossword
    expect(cellGroups.length).toBe(21);
  });

  it("renders clue text in the clue list", () => {
    const { container } = render(Crossword, { props: { data: miniData } });
    const clueButtons = container.querySelectorAll("button.clue");
    expect(clueButtons.length).toBe(miniData.length);
  });

  it("renders toolbar buttons", () => {
    const { container } = render(Crossword, { props: { data: miniData } });
    const buttons = container.querySelectorAll(".toolbar button");
    expect(buttons.length).toBe(3); // clear, reveal, check
  });

  it("supports custom actions list", () => {
    const { container } = render(Crossword, {
      props: { data: miniData, actions: ["clear", "reveal"] },
    });
    const buttons = container.querySelectorAll(".toolbar button");
    expect(buttons.length).toBe(2);
  });

  it("renders with empty data (validation passes vacuously)", () => {
    const { container } = render(Crossword, { props: { data: [] } });
    // validateClues returns true for empty array (no failures)
    // so the component still renders its wrapper
    expect(container.querySelector(".svelte-crossword")).toBeTruthy();
    // but with no cells
    expect(container.querySelectorAll("g.cell").length).toBe(0);
  });

  it("renders direction labels (across/down)", () => {
    const { container } = render(Crossword, { props: { data: miniData } });
    const directionLabels = container.querySelectorAll(".clues--list p");
    const texts = Array.from(directionLabels).map((p) => p.textContent);
    expect(texts).toContain("across");
    expect(texts).toContain("down");
  });
});

describe("Toolbar component", () => {
  it("renders default actions", () => {
    const { container } = render(Toolbar);
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(3);
    expect(buttons[0].textContent).toBe("Clear");
    expect(buttons[1].textContent).toBe("Reveal");
    expect(buttons[2].textContent).toBe("Check");
  });

  it("renders only specified actions", () => {
    const { container } = render(Toolbar, { props: { actions: ["clear"] } });
    const buttons = container.querySelectorAll("button");
    expect(buttons.length).toBe(1);
    expect(buttons[0].textContent).toBe("Clear");
  });

  it("dispatches event on button click", async () => {
    const { container, component } = render(Toolbar);
    let eventDetail = null;
    component.$on("event", (e) => {
      eventDetail = e.detail;
    });
    const clearBtn = container.querySelectorAll("button")[0];
    await fireEvent.click(clearBtn);
    expect(eventDetail).toBe("clear");
  });
});
