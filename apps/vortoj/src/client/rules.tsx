import { For } from "solid-js";
import type { JSX } from "@solidjs/web";
export function Rules(props: { trigger: (open: () => void) => JSX.Element }) {
  let rulesDialog: HTMLDialogElement | undefined;
  return (
    <>
      {props.trigger(() => rulesDialog?.showModal())}
      <dialog
        id="vortoj-rules"
        class="game-dialog"
        aria-labelledby="game-rules-title"
        ref={(element) => {
          rulesDialog = element;
        }}
      >
        <div class="dialog-heading">
          <h2 id="game-rules-title">Game rules</h2>
          <button type="button" aria-label="Close game rules" onClick={() => rulesDialog?.close()}>
            ×
          </button>
        </div>
        <h3>Place a word</h3>
        <p>
          Choose a tile, then an empty square. Place one to seven tiles in a single row or column
          without gaps; existing tiles can connect them. Every word must contain at least two
          letters. The first word covers the ★ square; later moves connect to the board. On small
          screens, tap the board to zoom and swipe to explore.
        </p>
        <h3>Bonus squares</h3>
        <div class="bonus-key">
          <For
            each={[
              { bonus: "DW", text: "2×", description: "Whole word" },
              { bonus: "TW", text: "3×", description: "Whole word" },
              { bonus: "DL", text: "2×", description: "New letter" },
              { bonus: "TL", text: "3×", description: "New letter" },
            ]}
          >
            {(example) => (
              <div class="bonus-key-item">
                <span class="bonus-key-square" data-premium={example.bonus} aria-hidden="true">
                  <span class="premium-label">{example.text}</span>
                </span>
                <span>
                  {example.text} {example.description.toLowerCase()}
                </span>
              </div>
            )}
          </For>
        </div>
        <p>
          Large labels multiply the whole word; half-size labels multiply the new letter. Bonuses
          apply only when a tile is first played. Letter bonuses apply before word bonuses, and word
          bonuses multiply together. Playing all seven tiles adds 50 points.
        </p>
        <h3>Word approval and turns</h3>
        <p>
          There is no dictionary check. Opponents vote on every new word, including cross-words. At
          least half the opponents must approve each word, rounded up. An accepted move scores and
          refills your rack. A rejected move returns your tiles and ends your turn. Turns and votes
          have no deadline.
        </p>
        <h3>Jokers, passing and exchanges</h3>
        <p>
          A * joker stands for a letter from this tile set and scores zero. Its letter stays fixed
          once accepted. You can pass, or exchange selected tiles when at least seven remain in the
          bag; either action ends your turn.
        </p>
        <h3>Finishing the game</h3>
        <p>
          The game ends when someone empties their rack with an empty bag, or after everyone takes
          two consecutive turns without scoring. Remaining tile points are deducted. A player who
          empties their rack also receives the opponents’ remaining tile points. The highest score
          wins.
        </p>
      </dialog>
    </>
  );
}
