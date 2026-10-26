# ikout-card-game — Testable Requirements (R1..Rn)

Source of truth: the owner's brief (this chat). Stack detected: **TanStack Start (React 19 + TypeScript + Vite) + Tailwind + Radix/shadcn + vitest**. Reference raw assets (`data.zip`, `assets.zip`) were **not available** — the in-repo `src/assets` and `public/assets` are used as the reference instead (owner confirmed earlier in chat).

## R0 — Config & flags
- R0.1 `docs/REQUIREMENTS.md` exists and lists every requirement with a testable ID.
- R0.2 Splash config block (min duration, creeper size, card size, look duration, fuse duration, sprite path, sound paths) exists at the top of the splash module.
- R0.3 Rule flags in `src/rules/config.ts`: `firstTrickLeadByRightOfBidder`, `jokerLeadAsSpade`, `jokerLeadFollowSuit`, `jokerBecomesHakamAfterTrumpAce`.

## R1 — Splash / intro (pure black, Creeper)
- R1.1 Splash background is pure black with no progress bar and no text.
- R1.2 Creeper fades in from the RIGHT edge, vertically centered, ~48–64px tall, side profile, pixel-crisp (nearest-neighbor).
- R1.3 It walks in a perfectly straight horizontal line to the center: no vertical movement, no bounce (measured).
- R1.4 Position is driven by real resource-loading progress (0% = right edge, 100% = center); motion is eased forward-only and pauses if loading stalls.
- R1.5 Optional flag: nervous look left/right after appearing (default ON, ~2s).
- R1.6 Optional flag: Spec Card at center, slightly larger than the Creeper (default ON).
- R1.7 On reach-center AND 100%: stop, swell + white flash + "tssss" fuse ~1–1.5s, then explode: flash, pixel fire/smoke particles, screen shake, explosion sound; card destroyed; fade to Main Screen.

## R2 — Main screen
- R2.1 Top-left profile icon shows the user's chosen avatar; opens the profile screen.
- R2.2 Four rectangular tiles, same size/height/spacing; Tile 1 = mode name with centered ikout icon; Tiles 2–4 have no function (reserved placeholders).

## R3 — Profile screen
- R3.1 Tapping the avatar opens a grid of ALL game characters; picking one + Save returns to profile.
- R3.2 Name field under the avatar.
- R3.3 Reserved placeholders: table-style and card-back selectors.
- R3.4 Bottom "Save changes" saves locally and returns to Main when anything changed; X (top-left) exits without saving; unsaved-change warning.
- R3.5 Profile persists locally.

## R4 — Game setup screen
- R4.1 Saved game exists → "Resume" above "New game"; otherwise only "New game".
- R4.2 Player count selector: 4 or 6.
- R4.3 "Limit" button sets the score limit (51/71/101).
- R4.4 Bottom: "Add players via Hotspot".

## R5 — Hotspot / room host
- R5.1 Host can create a room, show join info (room code/QR), list joined players, and start when ready.
- R5.2 Platform limits reported honestly (see report): browser/PWA cannot open a WebSocket server; `LocalHostServer` needs the Capacitor NodeJS bridge on device; in-browser it falls back to loopback (same-device testing).

## R6 — Game rules (unit-tested)
- R6.1 Bid 5 = Malzoum only (no Hakam/trump); voluntary bids are 6–9 (Hakam). Forced dealer is Malzoum 5.
- R6.2 Bidder wins → scores the bid value (5 for Malzoum).
- R6.3 Bidder loses → penalty is DOUBLE (Malzoum 5 → 10; Hakam 6–9 → 12/14/16/18) to the opponents.
- R6.4 First trick: the bidder does NOT lead; the player on his right leads and the bidder plays LAST (flag R0.3).
- R6.5 Joker is the strongest card EXCEPT when led: a led Joker becomes a Spade and any Spade or Hakam card takes it.
- R6.6 The Joker ranks right after the Hakam Ace (Red Joker > Hakam Ace > Black Joker).
- R6.7 A Joker played after the Hakam Ace becomes Hakam: beats every trump below the Ace, loses to the Ace (and to the Red Joker).
- R6.8 Everyone must follow Hakam when Hakam is led; Hakam beats everything except the Hakam Ace and the Joker.

## R7 — Audio & character voices
- R7.1 Every event maps deterministically to one sound (no randomness): Joker, Hakam declare ("Hass"), each special card.
- R7.2 No repeated/double sounds per card event (e.g. Shayeb plays once).
- R7.3 King line plays at most once per round.
- R7.4 Each character has its own message wording; the displayed text maps 1:1 to the spoken audio.

## R8 — Verification loop
- R8.1 Rules/engine suites run green (`vitest run src/rules src/engine`).
- R8.2 Every FAIL is re-tested after fix; the full checklist re-runs (regression), up to 5 rounds.

## Assumptions & ambiguities (owner to confirm)
1. **R6.4**: "the player on his right" is modeled as `bidderSeat + 1` under the existing counter-clockwise (`seat+1`) turn order — i.e. the next seat in turn order sits to the bidder's right. If the seating direction is mirrored in the UI, flip the flag.
2. **R6.5**: followers of a LED Joker must follow Spade (flag `jokerLeadFollowSuit: 'SPADE'`); the alternative (follow Hakam) is configurable but untested as default.
3. **R6.5**: the led Joker counts as the *weakest* Spade (rank 0) — any Spade beats it, matching "any Spade can take it".
4. **R6.7**: "becomes Hakam" is modeled as strength 850 — above every trump K..2, below the Hakam Ace (900) and Red Joker (1000).
5. **R6.1**: in Malzoum (bid 5) there is no Hakam; a led Joker is still beaten by Spades.
6. **R1.2/R1.4**: true Creeper sprite/fire/smoke pixel art requires `assets.zip` (not provided); current build uses CSS/SVG approximations — will be swapped when the archive arrives.
7. **R5**: cross-device hotspot play requires packaging the app (Capacitor + NodeJS bridge); the web build supports loopback/host-and-join on one device only.
