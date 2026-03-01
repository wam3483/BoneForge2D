# Project Research Summary

**Project:** BoneForge2D — Browser-based 2D skeletal animation editor
**Domain:** Creative tooling / 2D game development
**Researched:** 2026-02-28
**Confidence:** MEDIUM

## Executive Summary

BoneForge2D is a browser-based 2D skeletal animation editor targeting indie developers and hobbyists who need a free alternative to Spine ($69-$299). The competitive landscape is well-understood: Spine defines the gold standard of user expectations, DragonBones shows what "free but frustrating" looks like, and Rive signals where the space is moving (interactive state machines). BoneForge2D sits between DragonBones quality and Spine polish, with one primary differentiator that neither competitor offers to the PixiJS ecosystem: a native PixiJS runtime that closes the loop from editor to game without license fees, extra steps, or format translation. The architectural insight that drives this is that the editor viewport preview must use the identical interpolation and transform math as the exported runtime — using PixiJS for both collapses two implementations into one.

The recommended approach is React 19 + TypeScript 5 for the UI shell, PixiJS v8 as the unified editor viewport and runtime renderer, Zustand v5 + Immer for global state management, Radix UI Primitives + Tailwind CSS v4 for the UI layer, and a custom BoneForge JSON format with a dedicated PixiJS runtime npm package. The MVP scope is deliberately constrained to what allows a user to rig a character, animate it, and use it in a PixiJS game: bone hierarchy, image attachment, keyframe animation with linear and stepped interpolation, JSON export, and a PixiJS runtime. Bezier easing, IK, skin switching, and animation events are deferred to v1.1 and v2.

The dominant risks are architectural and must be addressed at Phase 1, before any UI code is written. Storing bone transforms in world space instead of local space, conflating the bind pose with the animated pose, using a flat keyframe struct instead of per-property channels, and retrofitting undo/redo architecture after mutation code is scattered are all known causes of complete rewrites in comparable tools. Additionally, the timeline panel must be designed as a canvas-rendered component from the start — rendering thousands of keyframe ticks as React DOM elements causes immediate scrub performance failure. Every one of these is a design decision, not a feature, and each has a clear prevention pattern documented in the research.

---

## Key Findings

### Recommended Stack

The stack is constrained by the project brief (React, TypeScript, browser-only) with the key discretionary choices being PixiJS v8 for the viewport and runtime, Zustand v5 + Immer for state, and Radix UI Primitives + Tailwind CSS v4 for UI. PixiJS is the correct choice because using it for both the editor viewport and the exported runtime means the editor preview IS the runtime — no translation layer, no preview-vs-export discrepancy. The team learns one graphics API. Zustand was chosen over Redux Toolkit (too much ceremony for a local tool with no server sync), Jotai (atom model poorly suited to a large interconnected document graph), and MobX (observable classes resist JSON serialization — critical for export). The File I/O strategy uses IndexedDB as the primary session persistence mechanism and file download/upload as the secondary; the File System Access API is NOT recommended for v1 due to Firefox support gaps.

**Core technologies:**
- React 19 + TypeScript 5: UI shell and type safety — project constraints; strict mode mandatory for deeply nested bone/keyframe structures
- PixiJS v8: editor viewport AND runtime playback — unified renderer eliminates editor/runtime discrepancy; v8 ships WebGL2/WebGPU backend
- Zustand v5 + Immer v10: global editor state — sliced stores with immutable Immer mutations for deeply nested bone trees; Immer patches enable low-overhead undo/redo
- Radix UI Primitives + Tailwind CSS v4: UI components and styling — accessible unstyled primitives with custom dark editor theme; Tailwind v4's Oxide engine is faster
- Vite v6: build tool — fastest cold start, native ESM, excellent TS support with no config ceremony
- Vitest v3 + Playwright v1: testing — Vite-native unit tests for pure transform math and interpolation; Playwright for E2E canvas/WebGL flows (jsdom cannot render WebGL)
- IndexedDB + file download/upload: file I/O — IndexedDB primary for session persistence; download/upload secondary; FSA API deferred to post-v1

**Version verification required before scaffolding:** pixi.js ^8.x, @pixi/react ^8.x, zustand ^5.x, tailwindcss ^4.x, and vite ^6.x were not confirmed against a live npm registry during this research session. Verify all five with `npm view [package] version` before project setup.

### Expected Features

The feature landscape is well-understood from analysis of Spine, DragonBones, COA Tools, and Rive. The table stakes list is consistent across all reference tools; absence of any item causes immediate user abandonment. Stepped interpolation is a low-cost differentiator with immediate value for the pixel art audience. IK is explicitly deferred to v2 — it represents the single largest UX improvement but is also the single largest implementation effort (Very High complexity per the research).

**Must have (table stakes — v1 MVP):**
- Bone creation, naming, and parent-child hierarchy — the foundational concept; without it nothing else works
- Bone viewport manipulation (move, rotate, scale) with correct local-space storage and hit testing — primary interaction mode
- Pose Mode vs. Animate Mode split — the Spine mental model users expect; critical for bind pose correctness
- Image import (PNG/JPG) and attachment to bones with draw-order control — nothing to rig without art
- Keyframe system with linear and stepped interpolation — minimum acceptable animation capability
- Timeline scrubbing and real-time playback preview — how animators validate work
- Named animations per skeleton (idle, walk, attack) — every game character needs multiple
- JSON export — users must be able to take output somewhere
- Undo/Redo — not a polish feature; users will report absence as a critical bug from day one
- Save/Load project (IndexedDB + file download/upload) — users cannot lose work between sessions
- Zoom and pan viewport — mandatory for detail work
- Layer/draw order for slots — arm behind torso, etc.

**Should have (competitive differentiators — v1 or v1.1):**
- Stepped interpolation — essential for pixel art / frame-by-frame style games; very low implementation cost
- PixiJS runtime package — closes the editor-to-game loop; primary competitive advantage over DragonBones
- Animation events/markers — trigger game logic at specific frames; high value for game developers
- Grid and snap — precision placement; frequently requested; low cost
- Keyboard shortcuts — power user velocity; dramatically accelerates workflow
- Copy/paste keyframes — reuse animation segments across animations
- Loop region markers — set in/out points for looping preview
- Onion skinning — ghost of adjacent frames during key placement
- In-editor FPS/timing preview — show animation at target FPS (24, 30, 60)
- Skeleton preview at runtime scale — see what the animation looks like in-game dimensions

**Defer (v2+):**
- Bezier easing curve editor — high cost (requires Bezier numerical solve + curve editor UI sub-system); the export format field should be reserved from day one even though only "linear" and "stepped" are implemented in v1
- Skin / skin set switching — high value for RPG developers; high cost to implement correctly
- IK (Inverse Kinematics) — Very High complexity; single largest v1-to-v2 improvement

**Explicitly out of scope (never for v1):**
- Mesh/FFD deformation, sprite atlas packing, collaborative editing, cloud sync, video/GIF export, Spine-compatible format, bone physics, plugin system, Rive-style interactive state machines

### Architecture Approach

BoneForge2D uses a strict five-layer architecture with the Zustand store as the single source of truth: all components are read-only consumers that dispatch mutations — no bone data lives in component state. The animation engine is a pure function (`evaluatePose(skeleton, animation, currentTime) -> Map<boneId, WorldTransform>`) with no side effects, making it trivially testable and directly shareable between the editor viewport and the PixiJS runtime. The JSON exporter is a distinct serialization step that maps EditorState to a clean runtime format, stripping all editor-only fields (selected bone ID, viewport pan/zoom, undo history, etc.). The build order is dependency-driven bottom-up: data model and store first, then animation engine, then viewport, then panels, then timeline, then exporter, then PixiJS runtime last.

**Major components:**
1. Editor State Store (Zustand + Immer) — single source of truth for skeleton, animations, keyframes, selection, playback state, and viewport transform; only place state lives
2. Animation Engine (pure function) — evaluates world transforms at any currentTime via topological sort + forward kinematics + per-channel interpolation; shared between editor viewport and PixiJS runtime
3. Viewport / Canvas (PixiJS) — stateless read + interaction surface; renders evaluated pose; fires user interaction events upward; never owns data
4. Hierarchy / Properties / Animation Panels (React) — display state; dispatch mutations; no local copies of bone data; no canvas logic
5. Timeline Panel (canvas-rendered) — keyframe ticks and scrubber rendered on `<canvas>`, not React DOM elements; React manages selection state only
6. JSON Exporter — serializes EditorState to BoneForge runtime format with topologically-sorted bones, pre-sorted keyframes, integer bone indices, and `formatVersion` field
7. PixiJS Runtime (separate npm package) — loads exported JSON; drives animation via `BoneForge2DAnimation extends PIXI.Container`; peer-depends on pixi.js ^8; zero editor dependencies

**Documented anti-patterns to avoid:**
- Bone data in component state — panels must be read-only consumers
- Animation evaluation inside the timeline — duplicates engine logic, causes visual/export discrepancy
- World transforms stored on Bone objects — world transforms are always ephemeral computed values, never stored
- Raw mouse coordinates applied to bone positions without viewport inverse transform
- Spine-compatible export format — license ambiguity and format constraints
- Editor-only metadata in the exported runtime JSON

### Critical Pitfalls

Research identified 6 critical pitfalls (force rewrites or break downstream compatibility if missed) and 9 moderate/minor pitfalls. Top 5 by impact and phase urgency:

1. **World-space bone storage (Phase 1 — non-negotiable)** — Store ALL transforms in local space (relative to parent bone) from day one. Implement `localToWorld()` / `worldToLocal()` helpers and unit test them before writing any bone interaction code. World-space storage permanently corrupts keyframes on reparenting and makes rotation inheritance impossible to implement correctly.

2. **Flat keyframe struct instead of per-property channels (Phase 2 — data model)** — Use per-property channels: `boneTracks[boneId].rotation = [{ time, value, easing }]`. This is how Spine, DragonBones, and every production tool works. A flat struct makes it impossible to independently keyframe different properties at different times, balloons export file size, and requires schema migrations to add new animatable properties.

3. **Bind pose / animated pose conflation (Phase 1 — data model)** — `bone.bindTransform` must be a separate, immutable-after-animation concept. Keyframes store offsets from bind pose, not absolute values. Conflating these makes any bind pose edit after animations exist corrupt all keyframe data permanently. The UI must enforce Pose Mode vs. Animate Mode as strictly distinct interaction states.

4. **Undo/redo as an afterthought (Phase 1 — architecture decision)** — Choose Immer patches (recommended for this project given Zustand + Immer adoption) or the Command pattern before writing the first mutation. Retrofitting undo after mutation code is scattered across dozens of event handlers requires a complete rewrite of all mutation code. Immer patches are small, serializable diffs that integrate naturally with the Zustand store.

5. **Timeline rendered as React DOM elements (Phase 2 — UI architecture)** — The timeline must render keyframe ticks on a `<canvas>` element. 20 bones x 5 properties x 60 keyframes = 6,000 React elements re-rendered per frame during timeline scrub causes immediate performance failure. Design the canvas-rendered timeline from the start; retrofitting requires a full timeline rewrite.

---

## Implications for Roadmap

Based on the dependency graph from ARCHITECTURE.md, the feature dependency tree from FEATURES.md, and the phase-specific pitfall warnings from PITFALLS.md, the following phase structure is recommended. The architecture's bottom-up build dependency is the primary driver; pitfall prevention is the constraint that governs phase ordering within that dependency graph.

### Phase 1: Foundation — Data Model, Store, and Viewport Core

**Rationale:** Every subsequent component depends on the store and bone data model being correct. Four of the six critical pitfalls (world-space storage, bind pose conflation, undo architecture, coordinate system) are Phase 1 decisions that cannot be retrofitted cheaply. Building any UI before the store is correct leads to rework of all panels. The viewport must also be bootstrapped here because bone manipulation and image attachment are table-stakes features that form the core editing loop — without them, nothing can be validated.

**Delivers:** TypeScript data model (Bone, Transform, Skeleton, SkinAttachment, ImageAsset, EditorState interfaces); Zustand + Immer store with Immer-patch-based undo/redo wired in from the first mutation; coordinate system documented and enforced (Y-down, positive rotation = clockwise, matching PixiJS); `localToWorld()` / `worldToLocal()` transform helpers with unit tests; bone name uniqueness enforcement (UUID internal IDs, display names separate); PixiJS viewport with zoom/pan and screen-to-world coordinate transform matrix; bone creation, selection, move, rotate, scale in viewport (correct local-space storage); Pose Mode / Animate Mode toggle with data model distinction; image import via FileReader API; image attachment to bones with draw-order (zOrder); normalized pivot offsets on attachments.

**Addresses (FEATURES.md):** Bone creation and naming, parent-child hierarchy, viewport bone manipulation, zoom and pan, pose mode vs. animate mode, image import, image attachment, layer/draw order.

**Avoids (PITFALLS.md):** Pitfall 1 (world-space storage), Pitfall 3 (coordinate system), Pitfall 5 (undo architecture), Pitfall 6 (bind pose conflation), Pitfall 11 (attachment pivot normalization), Pitfall 12 (bone name uniqueness), Pitfall 13 (zoom/pan hit area bugs).

**Research flag:** NEEDS RESEARCH — PixiJS v8 API for pointer events, display object hit testing, and transform gizmo implementation. The v8 interaction API (`EventSystem`, `FederatedPointerEvent`) changed significantly from v7. Verify against live PixiJS v8 docs before Phase 1 implementation begins.

---

### Phase 2: Animation System and Timeline

**Rationale:** Animation is the core value proposition. The per-property channel keyframe model (Pitfall 2) must be locked into the data model before any keyframe storage is implemented — retrofitting from a flat struct to per-property channels requires a full data migration. The animation engine is a pure function with no UI dependencies and can be built and unit-tested independently. The timeline is a display surface for animation data and is meaningless without a working animation engine providing visual feedback during scrub development.

**Delivers:** Per-property channel keyframe model in EditorState (`boneTracks[boneId].rotation = [{ time, value, easing }]`); Animation Engine pure function `evaluatePose(skeleton, animation, currentTime)` with topological sort and forward kinematics; linear and stepped interpolation (Bezier deferred); named animation CRUD (create, rename, delete, select); canvas-rendered Timeline Panel (ruler, keyframe tick marks, scrubber drag — NOT React DOM elements); keyframe insertion, deletion, and selection; real-time playback loop with delta time clamped to prevent tab-backgrounding drift; viewport updates to show evaluated pose during scrub and playback.

**Addresses (FEATURES.md):** Keyframe insertion, timeline scrubbing, real-time playback, linear interpolation, stepped interpolation, named animations, multiple animations per skeleton.

**Avoids (PITFALLS.md):** Pitfall 2 (flat keyframe struct), Pitfall 8 (easing overreach — linear + stepped only), Pitfall 10 (React DOM timeline rendering), Pitfall 14 (RAF delta drift).

**Research flag:** STANDARD PATTERNS — forward kinematics and per-channel keyframe interpolation are well-documented algorithms. Canvas 2D timeline rendering is established. No phase-specific research needed.

---

### Phase 3: Export System, Save/Load, and PixiJS Runtime

**Rationale:** The export format must be designed and finalized before the PixiJS runtime is built — the runtime's only input is the export format. Building the runtime before the format is stable makes it a moving target and requires rebuild when the format changes. Save/load is addressed in this phase to close the data-loss risk before any user-facing release. The runtime is built last within this phase because it has zero editor dependencies and is a pure consumer of the stable export schema.

**Delivers:** BoneForge JSON export format v1 (bones in topological order, integer bone indices, pre-sorted keyframes, `formatVersion: 1`, easing type as reserved enum field); JSON Exporter that maps EditorState to RuntimeFormat and strips all editor-only fields; export produces ZIP bundle with `project.json` + `images/` directory and relative path references (no base64 embedding for images, resolving Pitfall 9); IndexedDB-based project persistence as primary save mechanism (stores images as ArrayBuffer, avoiding re-upload every session); file download/upload as secondary; NO File System Access API for v1 (Pitfall 7); PixiJS Runtime npm package (`BoneForge2DAnimation extends PIXI.Container`, `from(jsonUrl, textures)`, `play(name, loop)`, `update(deltaMS)`); runtime peer-depends on `pixi.js ^8`; UMD/IIFE bundle for non-npm users; editor viewport uses the same runtime class to drive preview (editor imports its own runtime).

**Addresses (FEATURES.md):** JSON export, save/load project, PixiJS runtime, skeleton preview at runtime scale.

**Avoids (PITFALLS.md):** Pitfall 4 (runtime parsing overhead — pre-sorted, integer-indexed format), Pitfall 7 (FSA API compatibility — IndexedDB primary), Pitfall 9 (image embedding — ZIP bundle with relative paths), Pitfall 15 (format version field from first export).

**Research flag:** NEEDS RESEARCH — PixiJS v8 `Container` / `Ticker` API for the runtime animation loop; npm package structure and publishing for a library with `pixi.js ^8` as a peer dependency; JSZip vs. native Compression Streams API for ZIP bundle generation; IndexedDB patterns for storing binary image data as ArrayBuffer.

---

### Phase 4: Panels, Quality-of-Life, and Differentiators

**Rationale:** The Hierarchy Panel and Properties Panel can technically be built in parallel with or before the viewport (they only read from and write to the Zustand store). However, placing them in Phase 4 means the core animation loop is validated before panel polish work begins, allowing scope decisions to be driven by real usage. Phase 4 is also where the low-cost differentiating features that elevate BoneForge2D above DragonBones are delivered, scoped based on implementation capacity after the core is solid.

**Delivers:** Hierarchy Panel (bone tree, selection, rename, parent/child reorder via drag); Properties Panel (transform inputs for selected bone, attachment management, zOrder control); keyboard shortcuts system (S=select, R=rotate, G=move, Delete=delete, Ctrl+Z/Y=undo/redo, Blender conventions); bone visibility toggle; grid overlay with bone snap; in-editor FPS/timing preview (24, 30, 60 fps); loop region markers (in/out points for looping preview); copy/paste keyframes; onion skinning (semi-transparent adjacent frames in viewport); animation events/markers (named event keyframes in export JSON, dispatched by runtime via EventEmitter).

**Addresses (FEATURES.md):** Hierarchy panel UX, properties panel, keyboard shortcuts, bone visibility toggle, grid and snap, in-editor FPS preview, loop region markers, copy/paste keyframes, onion skinning, animation events.

**Research flag:** STANDARD PATTERNS — Zustand selector patterns and Radix UI Primitives are extensively documented. Animation events require minor PixiJS EventEmitter integration research but no dedicated research phase.

---

### Phase Ordering Rationale

- Data model before all UI because four of the six critical pitfalls (world-space storage, bind pose conflation, undo architecture, coordinate convention) are data model decisions. Building interactive code before the model is locked forces rewrites of every consumer.
- Animation engine before timeline because the timeline's value is visual feedback — seeing bones move as you scrub. Without the engine, timeline development happens without feedback and produces untestable code.
- Export format before runtime because the runtime's correctness depends entirely on what the export produces. Building them in parallel creates a moving-target problem. Stabilizing the format first means the runtime is built once against a fixed contract.
- PixiJS runtime last (within Phase 3) because it has zero editor dependencies. It is a standalone library that happens to consume the stable export schema. Building it last means the schema is fixed and the runtime is not rebuilt when the editor evolves.
- Panels deferred to Phase 4 because the core animation loop (Phase 1-3) is the riskiest part of the project. Validating it first means panel scope decisions can be made with real usage data, not speculation.

### Research Flags

**Needs deeper research during planning (run `/gsd:research-phase`):**
- **Phase 1 and Phase 3:** PixiJS v8 API surface — pointer interaction API (`EventSystem`, `FederatedPointerEvent`), display object hit testing for bone gizmos (Phase 1), and `Container` / `Ticker` API for the runtime animation loop (Phase 3). PixiJS v8 changed the interaction system significantly from v7; do not assume v7 patterns apply.
- **Phase 3:** IndexedDB API for structured project storage with binary image blobs; ZIP bundle generation options (JSZip vs. Compression Streams API); npm peer dependency packaging for the runtime library.

**Standard patterns (skip phase research):**
- **Phase 2:** Forward kinematics, topological sort, per-channel keyframe interpolation, and canvas 2D rendering for the timeline are established algorithms with abundant reference implementations. No novel design decisions required.
- **Phase 4:** Additive features built on a stable foundation. Implementation is the challenge, not design.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Stack | MEDIUM | Core technology choices (React, TypeScript, PixiJS, Zustand, Immer, Vite, Radix, Tailwind) are HIGH confidence based on well-reasoned rationale. Version numbers (pixi.js ^8, zustand ^5, tailwindcss ^4, vite ^6, react ^19) are MEDIUM — npm registry was unreachable during research; verify before scaffolding. |
| Features | HIGH | Table stakes and anti-feature rationale are consistent across Spine, DragonBones, and COA Tools — very well-established. Differentiator complexity estimates are MEDIUM (inferred from community knowledge; validate with r/gamedev / PixiJS Discord). |
| Architecture | MEDIUM | Five major patterns (centralized state, pure animation engine, controlled viewport, undo/command, topological sort) are confirmed by production editor architecture analysis. Data model design is HIGH confidence; PixiJS v8-specific API surface is MEDIUM — verify against live docs for Phase 1 and Phase 3 implementation. |
| Pitfalls | MEDIUM | All 15 pitfalls are grounded in known failure modes from comparable open-source editors and general skeletal animation tooling. WebSearch was unavailable during research — File System Access API browser support (Pitfall 7) should be re-verified against current MDN compatibility tables before finalizing save/load architecture. |

**Overall confidence:** MEDIUM

The research conclusions are internally consistent and grounded in established domain knowledge. The MEDIUM rating reflects: (1) version numbers not confirmed against live npm registry, (2) PixiJS v8-specific API surface not verified against live docs, (3) external tool verification unavailable during the research session. The architectural recommendations and feature scope carry HIGH confidence as established patterns in the skeletal animation editor domain.

### Gaps to Address

- **npm version verification:** Run `npm view pixi.js version`, `npm view zustand version`, `npm view tailwindcss version`, `npm view vite version` before scaffolding. STACK.md flags the specific packages that need verification. Do this at project setup time.
- **PixiJS v8 interaction API:** Verify the current PixiJS v8 API for pointer events, display object hit testing, and the recommended boundary for `@pixi/react` vs. imperative Pixi code. Address in Phase 1 planning research.
- **PixiJS v8 runtime API:** Verify `Container`, `Ticker`, and transform API for the runtime implementation in Phase 3 planning research. The runtime is the project's primary differentiator; API correctness here is critical.
- **File System Access API current support:** The research recommends IndexedDB-primary / file download-secondary which sidesteps FSA API compatibility regardless. Confirm this strategy holds against current browser support data before finalizing Phase 3 design.
- **Tailwind CSS v4 install process:** v4 uses a new Vite plugin approach (`@tailwindcss/vite`) that differs from v3 (`tailwind.config.js`). Verify before scaffolding.
- **Zustand v5 stable status:** Was in beta/RC at training cutoff (August 2025). Confirm stable v5 release; fallback to Zustand v4 is viable with near-identical patterns.

---

## Sources

### Primary (HIGH confidence)
- BoneForge2D PROJECT.md — project constraints, target audience, technology mandates
- Radix UI Primitives — stable v1 for 2+ years; extensively documented
- File System Access API (MDN) — Chromium stable since 2021; Firefox partial support documented
- Vitest — Vite-native; well-established; HIGH confidence
- Playwright — well-established E2E framework; HIGH confidence
- Forward kinematics / topological sort — standard computer science; textbook-level confidence
- Spine 2D feature set — training knowledge through mid-2025; consistent across multiple sources

### Secondary (MEDIUM confidence)
- PixiJS v8 release notes and scene graph API — training data through mid-2025; verify specific v8 API surface against live docs
- DragonBones open-source editor architecture — GitHub, training data
- Spine runtime JSON format — used for comparison and anti-pattern analysis only; not replicated
- Rive feature set — training data through mid-2025
- Zustand v5 + Immer v10 — training data; Zustand v5 stability and final API need live verification
- Tailwind CSS v4 — released early 2025; training data; v4 install process differs from v3 and needs verification
- PixiJS runtime integration patterns — MEDIUM confidence; pixi-spine patterns known but v8 API surface needs verification
- Architecture patterns (Spine, DragonBones, OpenToonz) — training data; not verified with live docs during session

### Tertiary (LOW confidence — validate before committing)
- Feature complexity estimates for differentiator features — based on comparable open-source editor implementations; individual implementation may vary significantly
- Feature popularity rankings among indie devs/hobbyists — inferred from community knowledge; validate against current r/gamedev, PixiJS Discord, itch.io forums
- IndexedDB patterns for image binary storage — general web platform knowledge; verify specific API patterns for ArrayBuffer storage before Phase 3

---

*Research completed: 2026-02-28*
*Ready for roadmap: yes*
