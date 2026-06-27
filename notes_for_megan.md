# Notes for Megan — sprite art sizing

## TL;DR

Export sprite PNGs at **~256–384px on the longest edge** (not 2048, not 40). Transparent
background, character roughly centered. That's it.

## Why

The game renders to an internal **960×540** canvas, then scales it to fit the window:

- 1080p screen → 2× zoom
- 4K screen → 4× zoom

On-screen, an enemy is ~**56px** tall and the player ~**64px** tall. So the biggest a sprite is
ever physically drawn is about `64 × 4 ≈ 256px` (on a 4K display). Art only needs ~4× the on-screen
size to stay crisp everywhere.

| Sprite  | In-game size | Max physical (4K) | **Export at**     |
| ------- | ------------ | ----------------- | ----------------- |
| Enemies | ~56px tall   | ~224px            | ~256px tall       |
| Player  | ~64px tall   | ~256px            | ~256–384px tall   |

**Rule of thumb: longest edge ≈ 256–384px (~4× the on-screen size).**

## What goes wrong at the extremes

- **Too big (e.g. 2048×2732):** the engine has to shrink it ~35× to reach 64px. Without mipmaps,
  WebGL samples poorly under that much minification, so smooth art turns grainy/sparkly in-game even
  though it looks clean when you open the file directly. It also costs ~22 MB of GPU memory *per
  texture* (~400 MB across all the sprites — enough to choke phones/older laptops).
- **Too small (e.g. 40px):** the opposite — the engine has to enlarge it, so it goes blurry/soft as
  soon as the game is on anything bigger than a tiny window.

## Format details

- **PNG** with transparency (alpha).
- Character **centered** in the frame; transparent margins are fine — the game measures the opaque
  content and fits/grounds it automatically, so you don't need pixel-perfect cropping.
- Aspect ratio is up to you (tall, square, whatever) — the engine fits by the character's content,
  not the canvas.
- File locations:
  - Enemies → `public/assets/sprites/enemies/`
  - Player walk/idle frames → `public/assets/sprites/player/player_0.png … player_2.png`
  - Player jump frame → `public/assets/sprites/player/player_jump.png`

## How the code enforces size

You don't have to hit an exact pixel size — the code boxes every sprite to a consistent on-screen
size regardless of source resolution:

- Enemies: `BASE_DISPLAY` in `src/entities/Enemy.ts`
- Player: `PLAYER_CONTENT_H` in `src/entities/Player.ts`

Bigger source files just cost more memory and (past a point) look grainy. Staying near ~256–384px
keeps everything sharp and light.
