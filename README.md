# Province Wars

**▶ Play online: https://applespriter.github.io/province-war/**  ·  [中文版](https://applespriter.github.io/province-war/?lang=zh)

A real-time map conquest strategy game that runs in the browser. Pure static HTML/JS, no dependencies, no build step.

## Features

- **8 maps**: USA, China, Japan, Europe, India, Brazil, Germany, World (the World map wraps left↔right)
- **Any number of opponents** (up to every region), 3 AI difficulty levels, random or chosen starting region
- **City levels 1–4**: level 3 produces troops at normal speed, level 2 at 2/3, level 1 at 1/3, level 4 at 1.5×. Starting levels roughly follow each region's real economy
- **Experience**: garrisoned troops × seconds (capped at 100 troops) levels a city up; losing a city costs experience and can drop its level
- Attack lines when an AI launches an attack, and on-screen notices for captures and level changes
- English and Chinese UI (auto-detected; switch with the `中文` / `EN` button or `?lang=en` / `?lang=zh`)

## Controls

| Action | Input |
|---|---|
| Send troops / reinforce | Press on your city and drag to a target (passing over your other cities chains them in) |
| Select | Click your city; long-press or Shift+click to add more; drag on empty space to box-select |
| Attack with selection | Click a target |
| Deselect | Right-click (a selected city removes just that one) |
| Select all | `Q` |
| Send ratio | `1` 50% · `2` 80% · `3` all (default) |
| Move / zoom view | `WASD`, right-drag, mouse wheel, `0` to reset |
| Pause | `Space` / `Esc` |

## Run locally

Open `index.html` in a browser.

## Map data

`build.js` converts GeoJSON files in `raw/` (not committed; sources are listed in `build.js`) into `maps/*.js`. Initial city levels live in `maps/levels.js`.
