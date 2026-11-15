# Research and decisions

This document records what I looked at before building the Faserlauf site and configurator, and which
decisions followed from it. It summarizes findings in my own words; nothing is copied from the sources, and
no design, brand or 3D model of an existing furniture company was reused. Sources are listed at the end of
each section so the reasoning can be checked.

Research date: November 2026.

---

## 1. The business name

**Faserlauf** is the German carpenters' word for grain direction, i.e. the way the wood fibers run through a
board. It fits a workshop whose selling point is solid wood that is cut and oriented with care, and it ties
directly to a technical detail of the configurator (the grain on every part runs along its length).

Checks (web search, November 2026): `"Faserlauf" Tischlerei OR Möbel OR Werkstatt` and `"Faserlauf" Berlin`
returned no business, workshop, shop or brand with that name, only woodworking literature using the
ordinary word. The fictional workshop is therefore called **Faserlauf Möbelwerkstatt** (shown as
"Faserlauf — Furniture Workshop, Berlin" on the English site).

---

## 2. How good furniture configurators work

What I looked at: articles on configurator and product-builder UX (vendor knowledge bases and e-commerce
agencies; their conversion percentages are self-reported, so I only used the qualitative patterns), plus
my own walk-through of the typical flow of furniture-store room planners and made-to-measure shops (looked
at for structure only, not for visuals).

Patterns that hold up across sources, and what I did with them:

| Finding | Decision for Faserlauf |
|---|---|
| Users abandon long, open-ended option lists. A fixed order of decisions with a visible position ("step 2 of 4") reduces effort. | Four steps in the order a carpenter would ask: **Size → Build (legs, edge, shelves) → Wood & finish → Review & request**. Steps are tabs, not a locked wizard: every step stays reachable. |
| Start from a sensible default instead of an empty state. | Every product opens with a proportioned, buildable default (e.g. dining table 200 × 90 × 75 cm, 30 mm oak, oiled). |
| Show the price at every step and tie each change to its cost. Sticker shock at the end is the main reason for abandonment. | The total is always visible (sticky bar on phones, panel footer on desktop). Wood and finish choices show their surcharge relative to the current choice ("+ €212"). An expandable breakdown shows material, labor, finish, delivery and VAT. |
| Disable or explain incompatible options instead of failing at the end. | Two levels: **warnings** (buildable but not ideal, e.g. a 2.40 m shelf in pine will sag visibly) and **blocking errors** (e.g. a 20 mm top across a 2 m trestle span). Errors name the fix ("choose at least 32 mm or switch to legs with an apron"), and the quote request is disabled until it is fixed. |
| Keep a summary of the current state visible; users should not have to remember earlier choices. | Summary chips under the viewer (dimensions, wood, finish) plus the review step. |
| Users want to come back later or show the design to a partner. | The **entire configuration lives in the URL** (`?p=dining-table&l=200&…`), updated as you change things, with a "Copy link" button. No account needed. |
| Comparing two variants is a common need for big-ticket items. | Variant A/B: save the current design as A or B, view both **side by side in the same 3D scene** (same scale, so size differences are honest) with a difference table; on phones a toggle switches between A and B. |
| Mobile is its own layout, not a shrunken desktop. One decision per screen, big tap targets, no tiny sliders. | Phone layout: 3D view pinned at the top (~45 % of the screen), step tabs and controls below, a fixed bottom bar with price and the main action. Dimension inputs are steppers (− / value / +) with a slider as secondary input; all targets ≥ 44 px. |

### Dimensions

Made-to-measure shops show dimensions in two ways: as numbers in the form and as lines in the drawing. I do
both: number inputs with units and limits (cm, 1 cm steps; plate thickness in mm), and toggleable 3D
dimension lines with labels in centimeters that follow the model. The input limits are stated next to each
field ("80–300 cm"), so nobody has to guess why a value was corrected.

### Trust elements for a carpentry website

Recurring advice for made-to-order furniture: be explicit about lead times (and that they are estimates),
show what happens between order and delivery, show construction and material knowledge, publish care
information, and explain warranty and delivery terms. Fake reviews are both against the brief and a
liability. Decisions:

- A process section on the home page and a full "How it works & pricing" page (inquiry → drawing and fixed
  quote → deposit → build → delivery) with demo lead times and delivery flat rates.
- A "Wood & finishes" page with properties, care and use per species, illustrated with the configurator's own
  textures, because material education is what convinces buyers of solid wood.
- A gallery of finished **example configurations** instead of testimonials, each one opening in the
  configurator.
- Clear labeling: every price says "demo price", the footer says "Demo project".

Sources: [Magebit: why customers abandon product builders](https://magebit.com/blog/why-customers-abandon-your-product-builder-and-how-to-fix-the-ux),
[Vervaunt: product builders, UX best practices](https://vervaunt.com/ecommerce-product-builders-configurable-products-considerations-ux-best-practices-examples),
[ar-range knowledge base: cognitive load, comparison, reassurance](https://www.ar-range.app/solutions/knowledge-base/how-can-i-reduce-cognitive-load-in-a-multi-step-configurator),
[Salesqueze: mobile configurator design](https://salesqueze.com/best-practices-for-mobile-configurator-design/),
[Coddleme: what makes a furniture brand trustworthy](https://www.coddleme.com/blogs/news/what-makes-a-furniture-brand-trustworthy-in-2026),
[Zigpoll: custom furniture shopping experience](https://www.zigpoll.com/content/how-do-you-envision-the-ideal-online-shopping-experience-for-your-customers-when-browsing-and-purchasing-custom-furniture-and-decor).

---

## 3. Framework choice

| Option | Verdict |
|---|---|
| **Astro 7 + React islands** | **Chosen.** Content pages are static HTML with almost no JavaScript; the configurator is one React island, and its 3D part is a separate chunk that only loads on the configurator page. Astro 7 (Rust compiler, Vite 8) is the current stable major. Server endpoints for the forms run through the official Node adapter while all pages stay prerendered. |
| Next.js | Capable, but ships the React runtime on every page and pushes towards a server-first setup. For ten mostly static pages plus one heavy tool, partial hydration is the better fit. |
| Plain Vite SPA | Would make the content pages depend on JavaScript (worse SEO, slower first paint). |

Notes from the Astro 7 upgrade guide that affected the setup:

- `compressHTML` now defaults to `'jsx'`, which removes whitespace between inline elements written on
  separate lines. Long prose with links is easy to break that way, so the project sets `compressHTML: true`
  (the v6 behavior).
- Unclosed tags are now build errors (good: the build catches broken markup).
- Astro's built-in CSP (`security.csp`) emits per-page hashes in a `<meta>` tag for prerendered pages. It is
  used here; headers that cannot go into a meta tag (`frame-ancestors`, `X-Content-Type-Options`, …) are
  set by the small production server.

Sources: [Astro v7 upgrade guide](https://docs.astro.build/en/guides/upgrade-to/v7/),
[Astro configuration reference (security.csp, compressHTML)](https://docs.astro.build/en/reference/configuration-reference/),
[@astrojs/node adapter](https://docs.astro.build/en/guides/integrations-guide/node/).

---

## 4. 3D in the browser: three.js and React Three Fiber

**Chosen:** three.js r187 with React Three Fiber 9 and a few drei helpers (OrbitControls, ContactShadows,
Html labels, Line, PerformanceMonitor).

Alternatives considered:

- *Plain three.js*: the scene state (dimensions, materials, room, compare mode) is derived from React state
  anyway; R3F maps that declaratively and handles disposal when components unmount.
- *Babylon.js*: excellent, but a larger runtime for what this project needs, and the React integration is
  less mature.
- *model-viewer*: made for displaying finished glTF files, not for generating geometry from parameters.

### Performance rules taken from the R3F docs and applied

| Rule (R3F "Scaling performance" / "Pitfalls") | Applied as |
|---|---|
| Render on demand instead of a 60 fps loop when nothing moves. | `frameloop="demand"`. Frames are only drawn while the camera moves or after a change. An idle configurator uses no GPU time (good for phone batteries). |
| Share geometries and materials; never create them per render. | Materials are cached per species × finish × grain orientation; textures per species; geometries are memoized per part size and disposed on change. |
| Don't mount/unmount expensive objects to toggle them; toggle `visible`. | Room, studio floor and the scale figure stay mounted and are hidden instead of removed. (Dimension lines are cheap and carry HTML labels, so they are mounted only when shown.) |
| Don't `setState` in the render loop. | No per-frame React state at all; the camera animation for preset views mutates refs. |
| Adaptive quality via `PerformanceMonitor`. | DPR starts at min(devicePixelRatio, 1.5); the monitor lowers it to 1 on weak devices and raises it to 2 on strong ones. |
| Keep draw calls low. | A bookcase with 8 shelves is ~25 meshes; the room adds 6. Far below the "few hundred" guideline. |

### Lighting and shadows

- **Environment lighting without HDR downloads.** drei's `<Environment preset>` fetches HDR files from a CDN
  at runtime, which has been unreliable and would be a third-party request (GDPR). three.js ships
  `RoomEnvironment`, a procedurally built studio scene that PMREM turns into an environment map in the
  browser. Zero downloads, neutral soft reflections.
- **Key light with a filtered shadow map.** One directional light with a 2048² (phones: 1024²) PCF shadow map
  whose shadow camera is fitted to the furniture's size: it gives the shelves inside a bookcase and the legs
  under a table their real shadows. (three.js r18x removed `PCFSoftShadowMap`; PCF with a blur radius
  replaces it.)
- **Contact shadows.** drei `ContactShadows` adds the soft darkening where the furniture touches the floor,
  the cue that makes objects "stand" instead of float. Rendered on demand like the rest.
- **ACES filmic tone mapping, sRGB output**, so wood colors don't clip in the highlights.

### Lazy loading 3D on a website

- The configurator island is hydrated with `client:only="react"` (WebGL cannot render on the server) and
  shows a server-rendered skeleton with the product name and a loading message until JavaScript runs.
- Inside the island, the WebGL viewer is a separate dynamic import. Controls and price appear first; the
  three.js chunk streams in parallel with a loading indicator.
- The home page hero uses a still image **rendered by the configurator itself** (see section 5), so the
  home page stays light and its largest paint is a compressed image, not a 600 KB script.
- No WebGL? A feature check runs before the viewer loads. Without WebGL the configurator still works
  (controls, price, validation, URL, inquiry), the viewer area shows a clear message and a static preview
  image of the product.

Sources: [R3F: scaling performance](https://r3f.docs.pmnd.rs/advanced/scaling-performance),
[R3F: performance pitfalls](https://r3f.docs.pmnd.rs/advanced/pitfalls),
[drei Environment docs and CDN preset issue](https://drei.docs.pmnd.rs/staging/environment),
[DEV: resolving environment preset loading errors](https://dev.to/anapimolodec/resolving-environment-preset-loading-error-in-react-three-fiber-5elc).

---

## 5. Wood textures without copyrighted files

Photo textures from texture sites come with licenses that are awkward to verify for client work, and they
tile visibly on long tabletops. Instead, the project has **one procedural generator** written in plain
TypeScript (`src/lib/wood/`), used in two places:

1. **At runtime** in the browser, to create the textures (color + roughness + normal maps) for the 3D model.
2. **At build/asset time** in Node, to write the swatch images for the wood page, product cards and Open
   Graph images. The furniture preview images are screenshots of the real configurator rendered in headless
   Chromium. Every image on the site is output of the project's own code.

How the generator models wood (following the common technique in procedural shading literature, with my own
parameters per species):

- **Growth rings:** a tree is a set of nested cylinders. A board is a plane sliced through that log, so the
  ring pattern is the distance from the (virtual) pith axis, warped by low-frequency noise so rings wander.
  Flat-sawn boards show "cathedral" arches where the plane cuts through rings at a shallow angle;
  quarter-sawn boards show near-parallel stripes. The generator places the pith off-board at a random offset
  per board to get both looks.
- **Earlywood / latewood:** within each ring, a smooth ramp from light earlywood to a sharper dark latewood
  band. The band sharpness is per species: very sharp in pine and ash (strong contrast), soft in beech and
  walnut.
- **Medullary rays:** oak and beech have rays visible on quarter-sawn faces ("fleck" in oak, small dark
  flecks in beech). They are thin elongated noise cells perpendicular to the rings, strongest where the cut
  is radial.
- **Pores:** ring-porous oak and ash get stretched dark pore lines along the grain; walnut gets finer
  pores; beech and pine almost none.
- **Knots (pine only):** a few elliptical knots per board that deflect the surrounding rings, with dark rims.
- **Fine fiber streaks:** high-frequency noise strongly stretched along the grain direction for the
  "combed" look of planed wood.
- **Color variation:** per species palette (earlywood, latewood, ray, pore colors) plus walnut's darker
  heartwood streaks and slight board-to-board tone shifts.
- **End grain:** a separate texture for the cut ends of every part (concentric rings seen from the top of the
  log), so a tabletop edge doesn't show stretched long grain.

The generator is deterministic (seeded PRNG) and runs in a Web Worker, so the page stays responsive while
it works. Measured in Node on the development PC: a 2048 × 1024 texture (desktop quality) takes about
0.7–0.8 s, the 1024 × 512 version used on phones and small screens about a quarter of that. Textures are
generated once per wood and cached; until they arrive, the model is shown in a flat wood color.

The texture covers 3.2 m along the grain, longer than the longest part (a 3 m table), so the grain never
repeats lengthwise and the cathedral arches can run in one direction like in a real board (a tiling
texture would force closed "eyes"). Across the grain it tiles seamlessly at a glue joint every 0.7 m. The
UVs are in real-world units, so a 3 m table shows real-scale grain instead of a stretched image, and every
part gets its own offset into the texture so that four legs don't show the same piece of wood.

Finishes are material settings, not separate textures: **oiled** deepens and warms the color and lowers
roughness slightly, **lacquered (matte)** adds a thin clear coat with low-gloss reflections, **raw** is
lighter, drier and rougher.

Sources: [Rusteria wood example (rings + fBm turbulence)](https://docs.rs/crate/rusteria/latest/source/examples/wood.rusteria),
[Apple Metal shader showcase: wood shader](https://developer.apple.com/library/content/samplecode/MetalShaderShowcase/Listings/MetalShaderShowcase_AAPLWoodShader_metal.html),
[UW–Madison graphics course: wood shader](https://pages.graphics.cs.wisc.edu/559-sp23/posts/wood),
[Foundry Modo: wood procedural](https://learn.foundry.com/modo/Content/help/pages/shading_lighting/shader_items/wood.html),
[Blender Artists: procedural wood discussion](https://blenderartists.org/t/procedural-wood-be-honest-what-do-you-think/1644469).

---

## 6. Structural checks: when is a combination "impossible"?

A configurator that lets people order a sagging shelf is worse than no configurator. The checks are based on
real beam theory instead of arbitrary limits:

- Shelves and tops are treated as simply supported beams under a uniform load. Deflection
  `δ = 5·q·L⁴ / (384·E·I)` with `I = b·t³/12` (b = depth of the board, t = thickness).
- **Stiffness (E) per species** from published averages for clear wood in bending (rounded): beech
  ~14 GPa, ash ~12.5 GPa, oak ~12 GPa, walnut ~11.5 GPa, Scots pine ~10 GPa. European test series put beech
  noticeably above oak, which matches the ordering.
- **Sag limit:** woodworkers' rule of thumb (the "Sagulator" target) is ≤ 0.02 in per foot initial sag,
  about **L/600**, because sag grows by roughly 50 % over time (creep) and becomes visible at around 1/32 in
  per foot. Between L/600 and L/300 the configurator warns; above L/300 the combination is blocked.
- **Loads:** shelves 115 kg/m² of shelf area (dense books), table tops 75 kg/m² (a well-laid table plus someone
  leaning on it, deliberately conservative), bench seats 160 kg per meter (people side by side).
- Tables with an **apron** (rail frame under the top) get the stiffness of the two long rails added.
  Trestle and panel bases have no apron, so the top has to carry the span alone, which is exactly when thin
  tops fail.
- Further rules: bookcases taller than five times their depth must be wall-anchored (warning, as tip-over
  is a real hazard); shelf spacing below 18 cm doesn't fit books (blocking); seat and desk heights outside
  the ergonomic range get a hint.

These are simplified engineering estimates for a demo, documented as such; a real workshop would still
check the drawing.

Sources: [WoodBin: Sagulator](https://woodbin.com/calcs/sagulator/),
[WoodBin: shelf sag measurements (origin of the 0.02 in/ft target)](https://woodbin.com/ref/shelf-sag-measurements/),
[Fine Woodworking: engineer shelves with the Sagulator](https://www.finewoodworking.com/2007/01/05/engineer-shelves-with-the-sagulator),
[TU Delft: mechanical properties of European ash and beech](https://repository.tudelft.nl/record/uuid:8a424e0c-e80c-4fe0-bfeb-094c3e3973cb).

---

## 7. Pricing model (demo)

Researched German carpentry rates to keep the invented prices plausible: guides list roughly €55–85 net per
hour for carpenters in 2026 (up to ~€95 in large cities), and custom solid-wood dining tables in the range of
€1,500–4,000. Retail prices for kiln-dried furniture-grade hardwood vary widely (forum figures for oak lumber
range from ~€1,250 to €3,200 per m³; beech is cheaper), so the demo uses round invented figures in that range.

The model (all values invented and labeled as demo prices):

- **Material** = volume of all parts from the cut list × species price per m³ × 1.45 yield factor
  (solid-wood offcuts, defects, planing allowance).
- **Labor** = hours × €78 net. Hours = base hours per product + per part + per m² of surface + edge profile
  + shelves/drawers, scaled by species workability (pine is quicker, oak and beech harder).
- **Finish** = finished surface area × rate per m² (raw €0, oiled €22, lacquered €34; includes sanding
  between coats).
- **Delivery** within Germany: pickup in the workshop free, Berlin flat rate €59, rest of Germany €179;
  +€70 for two-person carry when the piece exceeds 60 kg or 2.2 m.
- **VAT** 19 % on everything (German standard rate). Amounts are calculated in whole cents.

The price logic lives in `src/lib/pricing.ts`, is pure TypeScript (no browser APIs) and is unit-tested. The
server recalculates the price when an inquiry arrives, so a tampered browser can't send a fake price.

Sources: [trustlocal: Schreiner Kosten 2026](https://trustlocal.de/kosten/schreiner-kosten/),
[clean-invoice: costs and calculation for carpenters](https://www.clean-invoice.com/tischler/kosten-und-kalkulation-tischler),
[woodworker.de forum: current oak lumber prices](https://www.woodworker.de/forum/threads/holzpreis-eiche-aktuell.136633/post-1219279).

---

## 8. PDF, GLB and AR

- **PDF quote:** jsPDF 4 in the browser, loaded only when the button is clicked. Contents: configuration
  snapshot, specification, cut list (from the same parametric model as the 3D view), price breakdown with
  VAT, demo terms. jsPDF 4 restricts file system access in Node by default (a security fix); irrelevant in the
  browser, and the 4.2.x line contains further security fixes, so the current version is used.
- **GLB export:** three.js `GLTFExporter` (binary) exports only the furniture group with its generated
  color textures as JPEG (about 400 KB for a desk). The fine normal and roughness maps are left out: as PNG
  they made the file 5 MB for detail nobody sees in a planning tool. The worker's raw-pixel textures are copied
  into canvas textures for the exporter. Tested by reading the binary header and the glTF JSON (meshes,
  images, no room geometry).
- **AR: left out on purpose.** iOS Quick Look needs a USDZ file, Android Scene Viewer needs a publicly
  reachable HTTPS URL of the GLB, and WebXR AR only works in some Android browsers. None of this can be
  verified here (no phone, no public hosting), and a half-working AR button would hurt more than help.
  The GLB export is the honest foundation for adding it later.

---

## 9. Accessibility

- Everything in the 3D view has a non-pointer alternative: buttons for rotate left/right, zoom in/out and
  preset views (front, side, three-quarter, top); the controls panel itself is fully keyboard operable.
- The canvas has a text description (`aria-describedby`) that is updated with the current configuration in
  words, so the result isn't locked inside a picture.
- Price changes and validation messages are announced via a polite live region (debounced, so dragging a
  slider doesn't flood screen readers).
- Contrast is checked automatically in the end-to-end tests (WCAG AA).
- `prefers-reduced-motion` disables the camera fly-to animations.
