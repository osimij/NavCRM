# AI statement + glow

Archived from the NavCRM landing page on 2026-10-29: the black section `#ai` that read
"ИИ, встроенный в чаты, записи и отчёты", with "ИИ" and three inline icons lighting up in turn.
It is saved here so the section, and especially its glow effect, can be reused elsewhere.

| File | What it is |
| --- | --- |
| `glow.js` | The glow engine. No dependencies. Its header explains in detail how the effect works. |
| `glow.css` | The glow's tunable custom properties and the markup to use. |
| `ai-statement.css` | The section's typography and layout, plus the few site-wide styles it needed. |
| `index.html` | A working demo of the section with the three icons inlined. |

## Run the demo

`glow.js` is an ES module, so serve the folder rather than opening the file directly:

```bash
python3 -m http.server 4330 --directory archive/ai-glow-statement
```

Then open http://localhost:4330.

## How the glow works, in short

Light wells up in the middle of a shape and runs out to its edges along the shape's own outline,
like the Touch ID glyph: round on a round icon, pill-shaped on a word.

1. **Silhouette.** The element is drawn into a 64×64 canvas: icon strokes drawn fat so they merge
   into one body, an image's alpha, or text's line boxes.
2. **Depth map.** From the middle, the code measures how far the silhouette reaches in 96 directions
   and gives each pixel `depth = 1 − distance / reach`. Lines of equal depth are the silhouette
   shrunk towards its middle. The map is stored as a PNG.
3. **SVG filter.** A per-element `<filter>` maps depth through a soft band, colours the band with
   `--glow-hi`, clips it to the element's own pixels, tints the element with `--glow-base`, and
   adds a blurred bloom (`--glow-bloom`).
4. **Animation.** Each `--glow-period`, one `requestAnimationFrame` loop moves the band from the
   middle to the edge by changing a single filter attribute. The colour fades in and out over
   450 ms, and a stopping glow finishes its current run first. Under reduced motion the band
   holds still.
5. **Triggers.** Hover or focus on `[data-glow-trigger]` (or the element itself) runs it.
   `data-glow="loop"` and `data-glow-trigger="view"` run it while it is on screen.

## Use it in another project

1. Copy `glow.js` and `glow.css`.
2. Put `data-glow` on the icon or word itself, not on its button: the light fills everything the
   element paints.
3. Call `initGlow()` once the markup is in the page.

```html
<link rel="stylesheet" href="glow.css" />
<div data-glow-trigger="view" style="--glow-period: 2s">
  <span data-glow>ИИ</span>
  <svg class="i" data-glow style="--glow-delay: 0.3s"><use href="icons.svg#chat" /></svg>
</div>
<script type="module">
  import { initGlow } from './glow.js';
  initGlow();
</script>
```

Tune it with `--glow-base`, `--glow-hi`, `--glow-bloom`, `--glow-period`, `--glow-delay` and
`--glow-ease`, on `:root`, a section, or a single element. On light backgrounds use the
`.glow-on-light` values from `glow.css`.

## Notes

- The site set the section in ALS Hauss Next, a licensed variable font that is not included here.
  Set `--ai-font` on `.s-ai` to your own display face.
- The site's live copy stays in `landing/js/fx/glow.js` and `landing/css/fx/glow.css`. Its markup is
  in `src/partials/ai.html` and its styles in `landing/css/sections/ai.css`.
