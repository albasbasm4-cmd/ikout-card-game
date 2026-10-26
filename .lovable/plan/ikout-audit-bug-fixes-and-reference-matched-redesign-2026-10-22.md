# iKout: Audit, Bug Fixes, and Reference-Matched Redesign

## What the reference access actually covers
- Confirmed: the video is "iKout Trailer" by Diwaniya Labs. I can only get its cover frame, not the video itself. That means no other frames, no motion and no audio.
- The cover frame shows: a bright green sunburst background with a darker circular center; a thin top bar with "Score" on the red team (left) and the blue team (right), plus red and blue lines underneath; square player portraits (a man in a red shemagh) with the name above them, placed top, left and right; fanned card backs next to each player; dark arrow-shaped bid badges with yellow numbers; a center bid wheel of colored wedges (5 to 9) with a "pass" hand in the middle; standard large-index French-style cards in a wide fan at the bottom; a gold bottom bar with square gold icon buttons (exit, settings, rules) on the left and the local player's portrait and name on the right.
- Not visible: card backs up close, how played cards sit on the table, trump picker, dealing/collecting motion, win screens, and all sounds. For those I need screenshots or short clips from you. Until then I will extend the visible style consistently and mark those parts as "not verified against reference". Sounds will be original effects made to fit; I will not claim they were taken from the video.

## Phase 1: Audit (first deliverable, no file changes)
A written report covering build/type/test runs, engine, AI, multiplayer, persistence, audio, layout and fullscreen. Each item gets location, impact and fix. Already confirmed:
1. **Resume is broken.** The app reads the saved game but the game screen calls the game hook without the saved state, so "Resume" starts a new game. Fix: pass the saved state through and check it is restored as is (hands, table cards, turn, scores, round, bids, trump).
2. **Room code is not checked when joining.** The join message can carry a room code, but the host's join handler never compares it. Fix: reject a wrong code with the existing error message type and keep the protocol unchanged.
3. **Fullscreen/landscape** is requested in two places (rotate prompt and game screen) with different error handling. Fix: one shared helper, called only from a user tap, with a quiet fallback to the rotate prompt when locking isn't allowed (iOS Safari doesn't allow it).

Scoring (BO6/BO4, bid made/failed, Malzom forced bid, target score, game end) gets compared against the existing rules config and tests. Anything ambiguous gets flagged, not changed.

## Phase 2: Fixes, each with a regression test
- Resume restoration: a round trip test (save, load, compare the full state).
- Room code: tests for valid code, wrong code, missing code, and reconnecting with the same token.
- Scoring: fixes only for bugs proven by a failing test.
- Audio: guard every sound call so a failure can never block a move, unlock audio on the first tap, and throttle repeats of the same sound.
- Build/lint/tests: run the existing commands and report the real results.

## Phase 3: Redesign (presentation only)
- Background: green sunburst plus a central circle, shown full screen.
- Top score bar and bottom gold control bar like the frame. Existing buttons get mapped onto them; nothing is removed.
- Player seats: portrait tile, name, fanned card backs, arrow bid badge. Generated portrait art in the same style. Six-player mode gets two extra seats in the same style.
- Bid panel restyled as the colored wedge wheel. Same bid values and same rules.
- Cards redrawn as crisp scalable cards with large corner indexes, in the reference's wide overlapping fan.
- Hand sorting: group by suit, then order by the rules engine's own strength comparison, with a fixed suit order. Display only, the game state is not touched. A toggle keeps the current order available.
- Animations: lift on select, fly to the table, deal and collect. Short timings, never delaying a move, and reduced motion is respected.
- Sounds: new original effects for select, deal, play, collect, turn, score, win and lose, using the existing sound on/off setting plus a volume slider.

## Phase 4: Verification
Tests, a build check, and screenshots at phone landscape, phone portrait, tablet and desktop, compared side by side with the reference frame. The final report lists differences and anything left untested (real-device orientation locking, LAN play that needs the phone app).

## Technical details
- Resume: `IkoutApp` passes `resumedState` to `GameScreen` and into `useGame({ initialState })`, which already accepts it.
- Room code: `HostSession` stores its code; `handleJoin` checks `packet.payload.roomCode`.
- Sorting: a pure `sortHand(cards, trump)` in `src/rules/`, built on the existing compare functions in `cards.ts`, with unit tests.
- Theme colors go into `src/styles.css` as tokens; card faces become an SVG component; portraits go in `src/assets/images`.
- Engine, AI, protocol and rules files stay as they are except for the proven fixes above.
