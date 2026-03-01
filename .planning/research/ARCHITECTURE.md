# Architecture Patterns

**Domain:** Browser-based 2D skeletal animation editor
**Project:** BoneForge2D
**Researched:** 2026-02-28
**Confidence:** MEDIUM — based on established patterns from Spine, DragonBones, and general editor architecture; external docs unavailable during this session

---

## Recommended Architecture

### High-Level Overview

BoneForge2D is an editor application with a strict separation between:

1. **Editor State** (the authoritative in-memory data model — what IS)
2. **Editor UI** (React panels that display and mutate state)
3. **Viewport Renderer** (canvas/WebGL renderer that reads state for display)
4. **Exporter** (serializes state into the runtime JSON format)
5. **PixiJS Runtime** (separate library that loads exported JSON and plays it back)

```
┌─────────────────────────────────────────────────────────────────┐
│                         EDITOR UI (React)                        │
│  ┌──────────────┐  ┌─────────────────┐  ┌────────────────────┐  │
│  │  Hierarchy   │  │   Properties    │  │   Animation        │  │
│  │  Panel       │  │   Panel         │  │   Panel            │  │
│  │  (bone tree) │  │  (transforms,   │  │  (animation list,  │  │
│  │              │  │   skin attach.) │  │   keyframe mgmt)   │  │
│  └──────┬───────┘  └────────┬────────┘  └─────────┬──────────┘  │
│         │                   │                      │              │
│  ┌──────▼───────────────────▼──────────────────────▼──────────┐  │
│  │                    Editor State Store                        │  │
│  │          (Zustand or similar — single source of truth)      │  │
│  └──────────────┬────────────────────────┬────────────────────┘  │
│                 │                        │                        │
│  ┌──────────────▼──────────┐  ┌──────────▼──────────────────┐   │
│  │   Viewport / Canvas     │  │   Timeline Panel             │   │
│  │   (PixiJS or raw 2D)    │  │   (scrubber, keyframe dots,  │   │
│  │   Reads state, fires    │  │    interpolation curve)      │   │
│  │   selection/transform   │  │                              │   │
│  │   events back to store  │  │                              │   │
│  └─────────────────────────┘  └──────────────────────────────┘  │
└─────────────────────────────────────────────────────────────────┘
                        │
                        │ Export action
                        ▼
              ┌──────────────────┐
              │  JSON Exporter   │
              │  (serializes     │
              │   state → file)  │
              └────────┬─────────┘
                       │
                       ▼
              ┌──────────────────┐
              │  BoneForge JSON  │
              │  (downloadable   │
              │   .bfanim file)  │
              └────────┬─────────┘
                       │
          ─ ─ ─ ─ ─ ─ ─│─ ─ ─ ─ ─ ─ ─ ─
          │  PixiJS Game│Runtime (separate│)
                        ▼
              ┌──────────────────┐
              │  PixiJS Runtime  │
              │  (loads JSON,    │
              │   plays anims)   │
              └──────────────────┘
```

---

## Component Boundaries

| Component | Responsibility | Communicates With | Does NOT Do |
|-----------|---------------|-------------------|-------------|
| **Hierarchy Panel** | Display bone tree, allow selection, rename, parent/child reorder | Reads from store; dispatches select/rename/reorder actions | Rendering to canvas; keyframe management |
| **Properties Panel** | Display/edit selected bone transform (position, rotation, scale) and skin attachments | Reads selected bone from store; dispatches transform mutations | Selection logic; timeline scrubbing |
| **Timeline Panel** | Display time ruler, keyframe markers per bone/property, playback controls, scrubber | Reads animation keyframes from store; dispatches add/move/delete keyframe, set currentTime | Does not evaluate interpolated transforms (that is the animation engine's job) |
| **Animation Panel** | List named animations; create/delete/rename animations | Reads animation list from store; dispatches add/delete/select animation | Does not own keyframe data |
| **Viewport / Canvas** | Render skeleton (bones, images, selection handles, transform gizmos) at currentTime | Reads evaluated pose from animation engine; fires user interactions (drag, click select) | Owns no state — is a read + interaction surface |
| **Editor State Store** | Single source of truth for all project data (skeleton, animations, selections, currentTime) | All panels read from it; all panels write to it via actions | Rendering; file I/O |
| **Animation Engine** | Given skeleton + animation + currentTime, produce evaluated bone world transforms | Reads from store (skeleton + animation data + currentTime); output consumed by Viewport | UI; storage |
| **JSON Exporter** | Serialize EditorState into the runtime JSON format | Reads store; triggers file download | Play back animations |
| **PixiJS Runtime** (separate package) | Load exported JSON, create PixiJS display objects, tick through animations | Reads JSON file; interacts with PixiJS stage | Editor UI entirely |

---

## Data Flow

### Edit-Time Data Flow (not animating)

```
User interaction (panel or viewport)
    │
    ▼
Dispatch action to Editor State Store
    │
    ▼
Store updates (immutable update or Zustand patch)
    │
    ├──► React panels re-render (hierarchy, properties, animation list)
    │
    └──► Viewport re-renders (reads new skeleton state, redraws)
```

### Playback Data Flow (animation preview)

```
Timeline scrub / playback tick
    │
    ▼
Store.currentTime updates
    │
    ▼
Animation Engine reads:
    - skeleton (bone hierarchy, rest pose)
    - selected animation (keyframes per bone per property)
    - currentTime
    │
    ▼
Animation Engine evaluates:
    - Interpolate between surrounding keyframes
    - Compute local transforms per bone
    - Compute world transforms (forward kinematics, root → leaf)
    │
    ▼
Evaluated pose (Map<boneId, WorldTransform>)
    │
    ▼
Viewport renderer reads pose → draws bones + attachments at evaluated positions
```

### Export Data Flow

```
User clicks Export
    │
    ▼
JSON Exporter reads Editor State Store
    │
    ▼
Serializes to BoneForge JSON schema
    │
    ▼
Browser triggers file download (.bfanim or .json)
```

---

## Data Models

### Bone / Skeleton Data Model

```typescript
/** A single bone in the skeleton */
interface Bone {
  id: string;           // uuid — stable across renames
  name: string;         // display name, user-editable
  parentId: string | null; // null = root bone

  // Rest pose (bind pose) — local to parent
  restPose: Transform;

  // Ordered child list (for deterministic traversal)
  childIds: string[];
}

interface Transform {
  x: number;       // position x (pixels in editor space)
  y: number;       // position y (pixels in editor space)
  rotation: number; // degrees (or radians — pick one and be consistent; degrees for UI)
  scaleX: number;  // 1.0 = no scale
  scaleY: number;
}

/** An image attached to a bone */
interface SkinAttachment {
  id: string;
  boneId: string;
  imageAssetId: string;  // reference to imported image

  // Offset from bone origin (in bone-local space)
  offsetX: number;
  offsetY: number;
  offsetRotation: number;
  scaleX: number;
  scaleY: number;

  // Z-ordering within the skeleton
  zOrder: number;
}

/** The whole skeleton */
interface Skeleton {
  id: string;
  name: string;
  rootBoneId: string;
  bones: Record<string, Bone>;       // keyed by bone.id
  attachments: Record<string, SkinAttachment>; // keyed by attachment.id
}
```

### Animation / Keyframe Data Model

```typescript
/** Named animation */
interface Animation {
  id: string;
  name: string;            // e.g., "walk", "idle", "attack"
  duration: number;        // total duration in seconds
  fps: number;             // display FPS for timeline grid (e.g., 24)

  // Map of boneId → tracks for that bone
  boneTracks: Record<string, BoneTrack>;
}

/** All keyframe tracks for one bone */
interface BoneTrack {
  boneId: string;
  translateX: Keyframe[];
  translateY: Keyframe[];
  rotation: Keyframe[];
  scaleX: Keyframe[];
  scaleY: Keyframe[];
}

interface Keyframe {
  time: number;         // seconds from animation start
  value: number;        // the transform value at this keyframe
  easing: EasingType;  // how to interpolate TO this keyframe
}

type EasingType = 'linear' | 'stepped' | 'bezier';

// For bezier easing, additional control points are needed:
interface BezierKeyframe extends Keyframe {
  easing: 'bezier';
  cx1: number; cy1: number; // first control point
  cx2: number; cy2: number; // second control point
}
```

### Full Editor State

```typescript
interface EditorState {
  // Project data
  projectName: string;
  skeleton: Skeleton;
  animations: Record<string, Animation>;  // keyed by animation.id
  imageAssets: Record<string, ImageAsset>;

  // Editor UI state
  selectedBoneId: string | null;
  selectedAnimationId: string | null;
  selectedKeyframeRef: KeyframeRef | null;

  // Playback state
  currentTime: number;     // seconds
  isPlaying: boolean;

  // Viewport state
  viewportZoom: number;
  viewportPanX: number;
  viewportPanY: number;
}

interface ImageAsset {
  id: string;
  name: string;
  dataUrl: string;   // base64 data URL (loaded from file input)
  width: number;
  height: number;
}

interface KeyframeRef {
  animationId: string;
  boneId: string;
  property: 'translateX' | 'translateY' | 'rotation' | 'scaleX' | 'scaleY';
  time: number;
}
```

---

## BoneForge JSON Export Format

The export format is designed for easy PixiJS runtime consumption. It must be:
- Self-contained (no external image references beyond asset names)
- Flat enough to parse without complex logic
- Forward-kinematics friendly (parent bones listed before children)

```jsonc
{
  "version": "1.0",
  "name": "hero",
  "skeleton": {
    "bones": [
      {
        "id": "bone_root",
        "name": "root",
        "parent": null,
        "restPose": { "x": 0, "y": 0, "rotation": 0, "scaleX": 1, "scaleY": 1 }
      },
      {
        "id": "bone_torso",
        "name": "torso",
        "parent": "bone_root",
        "restPose": { "x": 0, "y": -100, "rotation": 0, "scaleX": 1, "scaleY": 1 }
      }
      // ... bones in topological order (root before children)
    ],
    "attachments": [
      {
        "id": "attach_torso_img",
        "bone": "bone_torso",
        "image": "torso.png",
        "offset": { "x": -32, "y": -64, "rotation": 0, "scaleX": 1, "scaleY": 1 },
        "zOrder": 1
      }
    ]
  },
  "animations": [
    {
      "name": "walk",
      "duration": 1.0,
      "fps": 24,
      "tracks": [
        {
          "bone": "bone_torso",
          "translateX": [],
          "translateY": [],
          "rotation": [
            { "time": 0.0, "value": 0,   "easing": "linear" },
            { "time": 0.5, "value": 5,   "easing": "linear" },
            { "time": 1.0, "value": 0,   "easing": "linear" }
          ],
          "scaleX": [],
          "scaleY": []
        }
      ]
    }
  ],
  "images": [
    {
      "name": "torso.png",
      "dataUrl": "data:image/png;base64,..."
    }
  ]
}
```

**Export design decisions:**
- Bones serialized in topological sort order so runtime can traverse top-to-bottom without a dependency resolution pass
- Image data embedded as base64 by default for portability; runtime optionally supports external paths
- Empty track arrays included explicitly (simplifies runtime parser — no missing-key checks needed)
- `version` field required for future migration compatibility

---

## Patterns to Follow

### Pattern 1: Centralized Immutable State (Zustand)

**What:** All editor data lives in a single Zustand store. Components never hold local copies of skeleton/animation data.

**When:** Always. This is the foundational pattern for the whole editor.

**Why:** Panels need to stay synchronized. Undo/redo requires snapshots of the whole state. The viewport renderer needs to react to any state change.

```typescript
// store/editorStore.ts
import { create } from 'zustand';
import { immer } from 'zustand/middleware/immer';

const useEditorStore = create<EditorState & EditorActions>()(
  immer((set, get) => ({
    // ... initial state
    addBone: (parentId: string | null) => set(draft => {
      const bone: Bone = { id: uuid(), name: 'bone', parentId, restPose: defaultTransform(), childIds: [] };
      draft.skeleton.bones[bone.id] = bone;
      if (parentId) {
        draft.skeleton.bones[parentId].childIds.push(bone.id);
      }
    }),
  }))
);
```

### Pattern 2: Animation Engine as Pure Function

**What:** The animation evaluator is a pure function: `evaluatePose(skeleton, animation, currentTime) → Map<boneId, WorldTransform>`. It reads state but has no side effects.

**When:** Whenever the viewport needs to render at a given time, or when exporting baked poses.

**Why:** Pure functions are trivially testable. The viewport just calls this function in its render loop — no subscriptions, no effects inside the evaluator.

```typescript
// engine/animationEngine.ts
function evaluatePose(
  skeleton: Skeleton,
  animation: Animation | null,
  currentTime: number
): Map<string, WorldTransform> {
  const localTransforms = new Map<string, Transform>();

  for (const bone of topologicalSort(skeleton)) {
    const track = animation?.boneTracks[bone.id];
    const local = track
      ? interpolateTrack(track, currentTime)
      : { ...bone.restPose };
    localTransforms.set(bone.id, local);
  }

  return computeWorldTransforms(skeleton, localTransforms);
}
```

### Pattern 3: Viewport as Controlled Display

**What:** The viewport canvas component does not own any state. It receives the evaluated pose and skeleton from the store, renders, and emits interaction events upward.

**When:** Always. Resist the urge to put bone data inside the canvas component.

**Why:** Decouples rendering from data. Allows the same rendering logic to be used for export (thumbnail generation, etc.).

### Pattern 4: Command Pattern for Undo/Redo

**What:** All state mutations go through a command system. Each command has `execute()` and `undo()` methods. A history stack stores executed commands.

**When:** From the very first bone creation. Retrofitting undo is painful.

**Why:** Undo/redo is a table-stakes feature for any editor. Without it users lose work and abandon the tool.

```typescript
interface Command {
  execute(state: EditorState): EditorState;
  undo(state: EditorState): EditorState;
  description: string;  // for undo menu display
}

// Alternative with Zustand: snapshot-based undo
// Take a snapshot of the Zustand store before each mutation,
// push to undoStack. Undo = replace store with previous snapshot.
// Simpler than command pattern; adequate for this scale.
```

### Pattern 5: Topological Sort for Bone Traversal

**What:** Always process bones root-to-leaf using a topological sort of the hierarchy.

**When:** World transform computation, export serialization, animation evaluation.

**Why:** Children depend on parent world transforms. Processing in wrong order produces incorrect positions.

```typescript
function topologicalSort(skeleton: Skeleton): Bone[] {
  const result: Bone[] = [];
  const visited = new Set<string>();

  function visit(boneId: string) {
    if (visited.has(boneId)) return;
    visited.add(boneId);
    const bone = skeleton.bones[boneId];
    if (bone.parentId) visit(bone.parentId);
    result.push(bone);
  }

  for (const boneId of Object.keys(skeleton.bones)) {
    visit(boneId);
  }
  return result;
}
```

---

## Anti-Patterns to Avoid

### Anti-Pattern 1: Bone Data in Component State

**What:** Storing bone transforms in `useState` inside the Hierarchy Panel or Viewport.

**Why bad:** Panels get out of sync. Undo/redo breaks. The viewport and properties panel show different values.

**Instead:** All bone data lives in the Zustand store. Components are read-only consumers with dispatched mutations.

### Anti-Pattern 2: Evaluating Animation Inside the Timeline

**What:** The Timeline panel doing its own interpolation to draw the preview curve.

**Why bad:** Duplicates the animation engine logic. Bugs cause visual-vs-exported discrepancy.

**Instead:** The Timeline only renders keyframe markers and the time position. For curve previews, call the shared `evaluatePose` function.

### Anti-Pattern 3: Mutable Skeleton Traversal

**What:** Storing computed world transforms on the `Bone` objects in the store.

**Why bad:** The store now mixes definition data (rest pose, hierarchy) with derived computed data (world transforms). This causes stale values and makes the store unpredictable.

**Instead:** World transforms are always ephemeral — computed fresh by `evaluatePose()` on each render tick, never stored.

### Anti-Pattern 4: Canvas Event Handling Without Coordinate Transforms

**What:** Using raw mouse coordinates from canvas events as bone positions.

**Why bad:** The viewport has pan and zoom. Raw coordinates are screen-space, not world-space. Bone positions in screen-space are unusable.

**Instead:** All interaction events must be transformed through the inverse of the viewport transform (pan + zoom) before being applied to the data model.

```typescript
function screenToWorld(screenX: number, screenY: number, viewport: ViewportState): Point {
  return {
    x: (screenX - viewport.panX) / viewport.zoom,
    y: (screenY - viewport.panY) / viewport.zoom,
  };
}
```

### Anti-Pattern 5: Spine-Compatible Format Temptation

**What:** Designing the JSON export to match or approximate Spine's .json format.

**Why bad:** Spine's runtime is proprietary; using its format invites license ambiguity. Also constrains future BoneForge features to Spine's data model.

**Instead:** BoneForge defines its own schema. Document it clearly. Build a dedicated PixiJS runtime that reads only BoneForge JSON.

### Anti-Pattern 6: Embedding Editor State in the Runtime

**What:** Shipping the same data model (with editor-only fields like `selectedBoneId`, viewport pan/zoom) in the exported JSON.

**Why bad:** Runtime doesn't need editor metadata; it bloats files and creates a coupling between editor version and runtime version.

**Instead:** The Exporter is a distinct serialization step that maps `EditorState → RuntimeFormat`, stripping all editor-only fields.

---

## Suggested Build Order

The dependencies between components drive a clear bottom-up build order:

```
1. Data Model + Store (foundation — everything depends on it)
         │
         ▼
2. Animation Engine (evaluatePose function — no UI dependencies)
         │
         ▼
3. Viewport Renderer (needs store + animation engine to render anything useful)
         │
         ▼
4. Hierarchy Panel (needs store; no dependency on viewport)
   Properties Panel (needs store; no dependency on viewport)
   [Build in parallel with viewport or after]
         │
         ▼
5. Timeline Panel (needs store + animation engine; most complex UI component)
         │
         ▼
6. JSON Exporter (reads store; no UI dependency)
         │
         ▼
7. PixiJS Runtime (separate — reads exported JSON; no editor dependency)
```

### Rationale

- **Store first** because every other component reads from it. Building panels before the store leads to rework.
- **Animation engine before viewport** because the viewport's primary job during animation preview is to display the evaluated pose; without the engine, the viewport can only show the rest pose.
- **Viewport before timeline** because timeline development is meaningless without a visual feedback loop — you need to see the bone move as you drag the scrubber.
- **Exporter before runtime** because the runtime's input is the export format; finalizing the format first prevents the runtime from becoming a moving target.
- **PixiJS Runtime last and separate** because it has zero editor dependencies; it's a standalone library that happens to share the JSON schema. Building it last means the schema is stable.

---

## Scalability Considerations

| Concern | At 50 bones | At 500 bones | Mitigation |
|---------|-------------|--------------|------------|
| World transform computation | Trivial — ~microseconds | Still fast (linear traversal) | Topological sort + simple matrix math; no optimization needed for v1 |
| React re-renders on scrub | Fine with memoization | Could degrade | Use `useMemo` / `useCallback` aggressively in panels; viewport renders via canvas (not React VDOM) |
| Timeline rendering | Fine | Could have thousands of keyframe dots | Canvas-based timeline (not DOM elements per keyframe) |
| JSON export size | ~10KB | Could be large with embedded images | Offer external image mode (image name reference vs base64) |
| Undo history memory | Snapshots cheap | Snapshots large | Limit undo stack depth (50 steps); consider delta-based undo for future |

---

## Sources

- Architecture patterns derived from established 2D animation editor design (Spine, DragonBones, OpenToonz architecture documentation) — MEDIUM confidence (training data, not verified with live docs during this session due to tooling restrictions)
- Data model design based on standard skeletal animation formats (BVH, Spine JSON, DragonBones JSON) — MEDIUM confidence
- Zustand state management patterns — HIGH confidence (well-documented, widely used in React editors)
- Forward kinematics implementation — HIGH confidence (standard linear algebra, no external dependency)
- PixiJS runtime integration approach — MEDIUM confidence (based on PixiJS 7/8 API patterns; verify against current PixiJS docs when implementing runtime)

**Note:** External documentation was not accessible during this research session due to tool permission constraints. Findings are based on training knowledge of established editor architectures. Confidence is MEDIUM; verify specific API details against live documentation during implementation phases.
