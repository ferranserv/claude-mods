# cockpit idle: beach lounge (archived 0.7.0)

Until 0.6.2 Clawd's idle state was a beach scene: sunglasses, a palm tree, the sun, and a drink with an umbrella.
0.7.0 replaced it with a neutral idle (sunglasses only). The drawing code for the beach (`beach`, `drink`) is
still in `cockpit/hooks/sprite.ts`; only the state definition changed. (Written for 0.7.0; since then the idle has more frames, a slow breath and a tip of the shades, and `docs/mascot/clawd-sheet.html` is generated from the code, so it shows whatever idle the code has.) To bring the beach back:

1. In `cockpit/hooks/states.ts`, replace the whole `idle:` entry of `STATES` (now a block of several frames) with:

```ts
  idle: { label: 'Clawd is lounging on a beach', face: '(-_-)~', fd: 0.5, frames: range(4).map(i => ({ beach: i, shades: 1, mouth: 'smile', armR: 'half', drink: i === 1 || i === 2 ? 2 : 1 })) },
```

2. In the same file set the pose every move into and out of idle uses (the first frame of the idle loop):

```ts
const SUN: Pose = { beach: 0, shades: 1, drink: 1, mouth: 'smile', armR: 'half' }
```

3. In the moves, put the beach back where the sunglasses-only frame stood:
   `'idle>thinking'` second frame `{ beach: 0, drink: 1, eyes: 'wide', armR: 'up', mouth: 'open' }`, and
   `'hello>idle'` third frame `{ beach: 0, drink: 1, eyes: 'happy', mouth: 'smile', armR: 'half' }`.
   Every other move into or out of idle (`bell>idle`, `walk>idle`, `idle>typing`, `idle>building`, ...) starts or ends on `{ ...SUN }`, so changing `SUN` carries them. `claude plugin test cockpit` fails until every move ends on the idle loop's first pose, so it tells you what is left.
4. Bump the cockpit `version` in `cockpit/.claude-plugin/plugin.json` and in `.claude-plugin/marketplace.json`. Also update `docs/MASCOT.md` and `README.md` (idle is described there).

Then regenerate the sheet with `bun tools/mascot-sheet.ts`.
