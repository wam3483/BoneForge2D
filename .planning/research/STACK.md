# Technology Stack

**Project:** BoneForge2D — Browser-based 2D skeletal animation editor
**Researched:** 2026-02-28
**Overall Confidence:** MEDIUM (versions flagged LOW; npm registry unreachable during research session — verify before locking)

---

## Recommended Stack

### Core Framework

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| React | ^19.x | UI shell, panels, timeline, inspector | Project constraint; v19 stable as of early 2025, concurrent features help with animation loop + UI coexistence |
| TypeScript | ^5.x | Type safety across editor and runtime | Project constraint; strict mode mandatory — bone trees and keyframe structures are deeply nested, types prevent entire classes of bugs |
| Vite | ^6.x | Dev server, bundler, HMR | Fastest cold start; native ESM; excellent TS support; no config ceremony for canvas apps; esbuild transforms |

### Canvas / WebGL Viewport (Editor)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| PixiJS | ^8.x | Editor viewport renderer AND runtime playback library | Unified renderer — same library in both the editor canvas and the exported PixiJS runtime means the editor preview IS the runtime; no translation layer needed. v8 ships a unified WebGL2/WebGPU backend. |
| @pixi/react | ^8.x | Optional React bridge for Pixi objects | Use ONLY for UI-adjacent overlays (e.g., bone handle hit areas as React DOM elements). Keep the main scene graph entirely in imperative Pixi code — do not drive the animation loop through React renders. |

**Why PixiJS for the editor viewport and not Konva, Fabric.js, or raw Canvas 2D:**
- Konva is React-friendly but built on Canvas 2D — no WebGL, no GPU compositing, will lag at high bone counts or high-res textures.
- Fabric.js is object-model heavy and 2D-only; designed for design tools, not real-time animation preview.
- Three.js / Babylon.js are 3D-first; 2D usage is awkward and adds 300 KB+ of dead weight.
- PixiJS is already the runtime target. Using it for the editor viewport means: (a) the editor preview renders identically to what the PixiJS game runtime will render, (b) the team learns one graphics API, (c) PixiJS v8's scene graph (Container, Sprite, DisplayObject) maps directly onto the bone hierarchy data model.

**Confidence: MEDIUM** — PixiJS v8 was released in early 2024 and was stable by mid-2024 per training data. Verify `8.x` is still the latest stable line before pinning.

### State Management

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Zustand | ^5.x | Global editor state (skeleton, bones, animations, keyframes, timeline position) | Zustand v5 (released late 2024) drops the deprecated API surface and is fully TypeScript-native. Minimal boilerplate for sliced stores. Devtools work. Immer middleware available for immutable bone tree mutations. |
| Immer | ^10.x | Immutable state updates for nested bone/keyframe trees | Bone hierarchies are deeply nested objects. Direct mutation patterns with Immer's `produce()` are far clearer than spread-chain updates 5 levels deep. Zustand's `immer` middleware integrates cleanly. |

**Why not Redux Toolkit:** RTK is excellent but adds ceremony (actions, reducers, selectors) that is overkill for a single-user local tool with no server sync. Zustand's slice pattern achieves the same modularity at 1/3 the boilerplate.

**Why not Jotai:** Jotai's atom model is optimal for fine-grained reactivity (e.g., individual form fields). The editor state is a large interconnected document graph (skeleton + all animations + timeline cursor), which is better modeled as a cohesive Zustand store with slices than as hundreds of interdependent atoms. Derived values (current frame's computed bone transforms) are cleaner as Zustand `getState()` selectors than atom derivations.

**Why not MobX:** Observable class instances resist serialization to JSON — critical when the store must serialize to the export format and persist to localStorage.

**Confidence: MEDIUM** — Zustand v5 was in beta/RC at training cutoff (August 2025). Verify stable v5 release before adopting. Fallback: Zustand v4 is stable and well-understood.

### UI Component Library

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Radix UI Primitives | ^1.x | Accessible unstyled primitives (dialogs, dropdowns, tooltips, sliders) | Zero styling opinions — editor UI has a custom dark theme. Radix handles a11y, keyboard nav, and focus management so we don't reinvent it. Slider primitives are essential for the timeline scrubber and easing curve editors. |
| Tailwind CSS | ^4.x | Utility-class styling for all panels, toolbars, inspectors | Tailwind v4 ships a new Rust-based engine (Oxide) — faster builds, no config file required in basic setups. Dark-mode-first via `dark:` variants. Co-locating styles with JSX is faster iteration than CSS modules for a solo/small team. |

**Why not shadcn/ui:** shadcn/ui is a distribution layer over Radix + Tailwind — it's a good starting point but its component defaults (padding, border radius, font sizes) assume a generic SaaS app aesthetic, not a dense editor UI. Pulling Radix primitives directly gives full control over the editor's compact layout without fighting component defaults. If velocity matters over polish, shadcn/ui is an acceptable shortcut.

**Why not MUI (Material UI):** MUI's theming system conflicts with Tailwind; its components are styled for business apps, not creative tools. Runtime CSS-in-JS has measurable overhead in animation-heavy UIs.

**Confidence: MEDIUM** — Tailwind v4 was released in early 2025. Verify v4 stability and migration path from v3. Radix UI Primitives v1 has been stable for 2+ years — HIGH confidence.

### File I/O (Browser)

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Native File System Access API | Browser API | "Save" / "Open" project files with persistent file handles | Supported in Chrome/Edge (Chromium). Enables true "save in place" UX — user picks a file once, subsequent saves overwrite without re-prompting. Graceful fallback to download for Firefox/Safari. |
| `file-saver` or native `<a download>` | ^2.x (file-saver) or native | Export JSON / download project file | For the export flow (JSON export), a plain `<a download>` with a Blob URL is sufficient and has zero dependencies. `file-saver` adds cross-browser robustness for large files if needed. |
| Native `FileReader` API | Browser API | Import images (PNG/JPG) into project | No library needed. `FileReader.readAsDataURL()` or `createObjectURL()` for converting dropped/selected files to texture sources for PixiJS. |

**Why no Electron / Node.js fs:** Project constraint — browser only for v1. File System Access API provides the closest experience to native file handling without leaving the browser.

**Confidence: HIGH** — File System Access API has been stable in Chromium since 2021. Firefox support remains partial as of training cutoff; document this as a known limitation.

### Testing

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vitest | ^3.x | Unit tests for pure logic (bone transform math, keyframe interpolation, JSON serialization) | Vite-native test runner — same config, same aliases, same module graph. Jest-compatible API. No separate Babel config. |
| Playwright | ^1.x | E2E tests for critical editor flows (load project, export JSON, timeline scrub) | The only E2E framework that reliably tests Canvas/WebGL apps via visual comparison. Vitest/jsdom cannot render WebGL. |

**Confidence: HIGH** — Both Vitest and Playwright are well-established in 2025.

### Build & Tooling

| Technology | Version | Purpose | Why |
|------------|---------|---------|-----|
| Vite | ^6.x | Build tool | (same as Core Framework row — one entry) |
| ESLint | ^9.x | Linting | v9 flat config is the new standard; TypeScript ESLint plugin integrated cleanly |
| Prettier | ^3.x | Formatting | Zero-config for TS/TSX; integrates with ESLint via `eslint-config-prettier` |

---

## PixiJS Runtime Integration

The BoneForge2D runtime is a standalone PixiJS plugin that loads the exported JSON and drives bone animations at runtime in a PixiJS game. Key design decisions:

### Architecture

```
BoneForge2D Editor (React + PixiJS)
  └── Exports: boneforge2d.json  (custom format)

PixiJS Game (user's project)
  └── @boneforge2d/runtime (npm package)
        └── Depends on: pixi.js ^8.x
        └── Reads: boneforge2d.json
        └── Creates: BoneForge2DSpine extends PIXI.Container
```

### Runtime Implementation Pattern

```typescript
// Runtime package entry point
import { Application, Container, Sprite, Texture } from 'pixi.js';

export class BoneForge2DAnimation extends Container {
  private bones: Map<string, BoneNode>;
  private animations: AnimationData[];
  private currentAnimation: string;
  private elapsed: number;

  static async from(jsonUrl: string, textures: Record<string, Texture>): Promise<BoneForge2DAnimation> {
    const data = await fetch(jsonUrl).then(r => r.json());
    return new BoneForge2DAnimation(data, textures);
  }

  play(animationName: string, loop = true): void { ... }
  update(deltaMS: number): void { ... } // called from PIXI.Ticker
}
```

The runtime must be distributed as:
- An npm package (`@boneforge2d/runtime` or similar) that peer-depends on `pixi.js ^8`
- A plain `<script>` UMD/IIFE bundle for users who don't use npm

### Editor Preview = Runtime Preview

The editor's viewport uses the same `BoneForge2DAnimation` class (or its internal equivalent) to drive the preview. This is the critical architectural constraint: the editor preview must use the identical interpolation and transform math as the runtime. Do NOT write separate preview code — import and use the runtime library directly in the editor.

**Confidence: MEDIUM** — This pattern (editor importing its own runtime) is proven (Spine editor does this). The specific PixiJS v8 API surface (Container, Ticker, Sprite) is HIGH confidence based on training data.

---

## Alternatives Considered

| Category | Recommended | Alternative | Why Not |
|----------|-------------|-------------|---------|
| Viewport Renderer | PixiJS v8 | Konva | Konva is Canvas 2D only — no WebGL; performance lags at animation preview frame rates with many sprites |
| Viewport Renderer | PixiJS v8 | Fabric.js | Design-tool heritage; Canvas 2D; no scene graph suitable for bone hierarchy |
| Viewport Renderer | PixiJS v8 | Three.js (2D mode) | 3D-first API; orthographic camera setup is awkward; 300+ KB overhead for features not needed |
| State Management | Zustand + Immer | Redux Toolkit | Excessive boilerplate for a local tool with no server sync; actions/reducers/selectors for bone mutations add friction |
| State Management | Zustand + Immer | Jotai | Atom model is fine-grained reactive but poorly suited to a large interconnected document graph (skeleton + all animations) |
| State Management | Zustand + Immer | MobX | Observable classes don't serialize cleanly to JSON — critical for export |
| UI Components | Radix Primitives + Tailwind | MUI (Material UI) | CSS-in-JS runtime overhead; design language conflicts with dark editor aesthetic |
| UI Components | Radix Primitives + Tailwind | shadcn/ui | Acceptable shortcut but opinionated defaults fight compact editor layout |
| Build Tool | Vite | Create React App | CRA is deprecated; webpack-based, slow |
| Build Tool | Vite | Next.js | Server-side rendering adds irrelevant complexity for a pure client-side tool |
| Testing | Vitest | Jest | Jest requires separate Babel config when using Vite; Vitest is the native choice |

---

## Installation

```bash
# Core editor dependencies
npm install react react-dom pixi.js @pixi/react zustand immer

# UI layer
npm install @radix-ui/react-slider @radix-ui/react-dialog @radix-ui/react-tooltip @radix-ui/react-dropdown-menu

# Tailwind CSS v4 (verify v4 install process — may differ from v3)
npm install tailwindcss @tailwindcss/vite

# Dev dependencies
npm install -D typescript vite @vitejs/plugin-react vitest playwright eslint prettier
npm install -D @types/react @types/react-dom typescript-eslint eslint-config-prettier
```

---

## Version Verification Required

The following versions were NOT confirmed against a live npm registry during this research session (tool access was limited). Verify before scaffolding:

| Package | Version Used Here | Verify At |
|---------|-------------------|-----------|
| pixi.js | ^8.x | https://www.npmjs.com/package/pixi.js |
| @pixi/react | ^8.x | https://www.npmjs.com/package/@pixi/react |
| react | ^19.x | https://www.npmjs.com/package/react |
| zustand | ^5.x | https://www.npmjs.com/package/zustand |
| tailwindcss | ^4.x | https://www.npmjs.com/package/tailwindcss |
| vite | ^6.x | https://www.npmjs.com/package/vite |

---

## Sources

- BoneForge2D PROJECT.md (project constraints and requirements)
- PixiJS v8 release context: https://pixijs.com/blog/pixi-v8-arrives (training data, HIGH confidence for v8 existence)
- Zustand documentation: https://zustand-demo.pmnd.rs/ (training data, MEDIUM confidence for v5)
- Radix UI Primitives: https://www.radix-ui.com/primitives (training data, HIGH confidence)
- Tailwind CSS v4: https://tailwindcss.com/blog/tailwindcss-v4 (training data, MEDIUM confidence)
- File System Access API: https://developer.mozilla.org/en-US/docs/Web/API/File_System_Access_API (training data, HIGH confidence)
- Vitest: https://vitest.dev/ (training data, HIGH confidence)
- Playwright: https://playwright.dev/ (training data, HIGH confidence)
