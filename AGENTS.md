<!-- LOVABLE:BEGIN -->
> [!IMPORTANT]
> This project is connected to [Lovable](https://lovable.dev). Avoid rewriting
> published git history — force pushing, or rebasing/amending/squashing commits
> that are already pushed — as it rewrites history on Lovable's side and the
> user will likely lose their project history.
>
> Commits you push to the connected branch sync back to Lovable and show up in
> the editor, so keep the branch in a working state.
<!-- LOVABLE:END -->

- The iKout game is a client-only SPA mounted from src/routes/index.tsx via ClientOnly + lazy import, because it relies on Web Workers, AudioContext and localStorage at module/render time.
- nodejs-project/ is a native (nodejs-mobile) LAN relay kept as source only; it is not part of the web build.
- Reference presentation uses dedicated CSS classes and semantic tokens; game rules, AI, and network behavior stay independent of visual matching.
- Trailer portraits and licensed French card faces are served through Lovable Assets pointers; retain the card asset license with source.
- Gameplay-reference media and sampled effects use asset pointers; referenceAudio owns interruptible client playback, while Table handles visual motion without changing engine timing or rules.
- Static generated Gulf Arabic lines use asset pointers and characterAudio owns single-voice playback and speaking-seat notifications; presentation effects stay separate from engine decisions to preserve gameplay and offline operation.
- Hand interactions preview on first tap and commit on second tap or a legal upward drag; ResizeObserver sizes the fan to the available phone width to prevent clipped cards.
- Player profile (name, portrait, table theme, card theme) lives in src/utils/profile.ts (localStorage + listeners); themes apply as CSS classes on .reference-game so game logic never depends on looks.
