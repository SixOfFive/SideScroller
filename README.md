# SideScroller — an ARK-inspired 2D multiplayer survival game

A browser-based, 2D side-scrolling survival game in the spirit of **ARK: Survival Evolved**.
Up to 8 players share one persistent world: punch trees, mine stone, craft tools,
build a thatch hut, light a campfire, cook food — and eventually tame dinosaurs.

No install needed — players just open a web page.

## Running the server

```
npm install
npm start
```

Then open `http://localhost:3000` in a browser. Other players on the same
network connect to `http://<your-LAN-IP>:3000`.

## Tech

- **Server**: Node.js + `ws` (WebSockets). Authoritative for inventory, harvesting,
  crafting, building, taming. Saves world state to `data/save.json` periodically.
- **Client**: Vanilla JS + Canvas 2D, ES modules. All art is drawn procedurally
  (no binary assets). Client predicts its own movement; other entities are
  interpolated from server snapshots.
- **Shared**: item/recipe/structure definitions live in `shared/` and are imported
  by both server and client.

## Design notes

- Resource nodes (trees, stone piles, berry bushes) respawn a few minutes after
  being depleted, ARK-style.
- Tool affinity matters: hands get thatch from trees, an axe gets wood; a pickaxe
  gets more stone and flint.
- The map is a long progressive strip — the spawn meadow is safe and sparse,
  the deep forest and rocky hills further out are richer.

## Roadmap

- [x] Stage 1: movement, gathering, crafting, building, campfire, hunger/food
- [x] Stage 2: dodos — hunting and passive taming
- [ ] Later: more dinos (Parasaur mount), metal tier, map gating, PvE threats
