# Feature Landscape

**Domain:** Browser-based 2D skeletal animation editor (targeting indie devs / hobbyists)
**Researched:** 2026-02-28
**Confidence:** MEDIUM — Based on deep knowledge of Spine, DragonBones, Creature2D, COA Tools, and open-source equivalents current through mid-2025. External tool verification was unavailable during this session; flag critical assumptions for phase-specific validation.

---

## Reference Tools Surveyed

| Tool | Status | Relevance |
|------|--------|-----------|
| Spine (Esoteric Software) | Active, paid ($69–$299) | Gold standard; defines user expectations |
| DragonBones (Egret) | Maintained, free | Free tier; clunky UX; primary free competitor |
| Creature2D | Abandoned | Defined mesh animation niche; now irrelevant |
| COA Tools (Blender add-on) | Active, free | Bone-based; export-oriented; no standalone editor |
| Rive | Active, free tier | Newer entrant; strong browser presence; motion-graph focused |

**Primary reference:** Spine sets the floor for user expectations. DragonBones shows what "free but frustrating" looks like. Rive shows where the space is moving (interactive/state-machine animation). BoneForge2D sits between DragonBones (free) and Spine (polish).

---

## Table Stakes

Features users expect from any skeletal animation tool. Absence causes immediate abandonment.

| Feature | Why Expected | Complexity | Notes |
|---------|--------------|------------|-------|
| Bone creation and naming | Core concept; without it, nothing else works | Low | Simple: click-to-place + name input |
| Parent-child bone hierarchy | Transforms propagate down the chain; mandatory for limb rigs | Medium | Tree data structure + recursive transform math |
| Bone selection, move, rotate, scale in viewport | Direct manipulation is the primary UX mode | Medium | Hit-testing on canvas, transform handles |
| Image (sprite) import (PNG / JPG) | Nothing to rig without art | Low | FileReader API + texture management |
| Image attachment to bones | Attaches a sprite region to a bone slot | Medium | Slot/attachment model; drawn at bone transform |
| Pose mode vs. animate mode | Spine's setup/animate split; users expect this mental model | Medium | Mode toggle; setup pose is baseline for all animations |
| Keyframe insertion for position / rotation / scale | The fundamental act of animation | Medium | Per-bone, per-property, per-time |
| Timeline scrubbing | Previewing without play is how animators work | Medium | Playhead drag; frame seek; time display |
| Real-time playback preview | "Does it look right?" — must answer this in the editor | Medium | requestAnimationFrame loop; interpolation engine |
| Linear interpolation between keyframes | Smoothest simplest case; minimum acceptable | Low | Lerp for position/scale, slerp or lerp for rotation |
| Named animations per skeleton | Characters need idle, walk, attack, etc. | Low | Animation list; create/rename/delete |
| Multiple animations per skeleton | Every game character needs more than one | Low | Depends on named animations |
| JSON export | Users need to take the result somewhere | Low | JSON.stringify of the data model |
| Undo / Redo | First thing users reach for after a mistake | High | Command pattern; full edit history |
| Zoom and pan viewport | Canvas navigation is mandatory for detail work | Low | Wheel + drag; transform matrix |
| Bone visibility toggle | Complex rigs need hide/show for focus | Low | Per-bone visibility flag |
| Layer / draw order for slots | Image stacking order (arm behind torso, etc.) | Medium | Z-order on slots; swap at runtime |
| Save / Load project (browser storage or download) | Users can't lose work between sessions | Medium | JSON serialize full project; localStorage or file download |

---

## Differentiators

Features that set the product apart. Not expected from a free/hobbyist tool, but highly valued when present.

| Feature | Value Proposition | Complexity | Notes |
|---------|-------------------|------------|-------|
| Stepped interpolation | Essential for frame-by-frame style games (pixel art) | Low | Immediate value at low cost; just don't lerp |
| Bezier / easing curve editor | Fine-tune feel of animations; Spine has it; DragonBones has it poorly | High | Curve editor UI is a significant sub-feature |
| PixiJS runtime (bundled) | Closes the loop — editor to game without extra steps | High | Separate library; must consume the custom JSON |
| Skeleton preview at runtime scale | See what the animation actually looks like in-game | Low | Scale the canvas viewport to a target resolution |
| Bone constraints: IK (Inverse Kinematics) | Walk cycles, arm reach — huge time saver; Spine has it; DragonBones lacks good IK | Very High | Defer to post-v1; marks this as a v2 differentiator |
| Animation events / markers | Trigger sound or game logic at a specific frame (footstep, attack hit) | Medium | Named event keyframe; exported in JSON; consumed by runtime |
| Skin / skin set switching | Swap character costume by switching skin; common in RPGs | High | Multiple attachment sets per slot |
| Bone color tinting | Visual aid during rig construction | Low | Editor-only; cosmetic |
| Grid and snap | Precision placement; highly requested | Low | Canvas overlay + snap-to logic |
| Onion skinning | See ghost of previous/next frame during key placement | Medium | Render adjacent frames semi-transparently |
| In-editor FPS / timing preview | Show animation at target FPS (24, 30, 60) not just elapsed ms | Low | Playback speed control |
| Keyboard shortcuts | Power users expect them; accelerates workflow dramatically | Low | Map common actions (S=select, R=rotate, etc.) |
| Copy/paste keyframes | Reuse animation segments across animations | Medium | Clipboard model for keyframe data |
| Loop region markers | Set in/out points for looping preview | Low | Useful for game animations |

---

## Anti-Features

Features to explicitly NOT build in v1. Each has a reason and an alternative approach.

| Anti-Feature | Why Avoid | What to Do Instead |
|--------------|-----------|-------------------|
| Mesh / free-form deformation (FFD) | Spine's most complex subsystem; requires a mesh editor, UV mapping, weight painting — weeks of work alone | Bone-based only; document limitation clearly |
| Sprite sheet / atlas packing | Orthogonal problem to animation editing; users have TexturePacker or similar | Accept individual image files; note in docs |
| Collaborative / multi-user editing | Requires backend, conflict resolution, auth — out of scope for a free solo tool | Local-only; export/import project files for sharing |
| Cloud storage / sync | Same as above — backend dependency; adds complexity and cost | localStorage + download/upload workflow |
| Spine-compatible export | Requires Spine runtime license to use; also the format is complex and proprietary | Custom JSON designed for BoneForge2D runtime |
| Video / GIF export | Rendering pipeline problem; frame capture is brittle in browsers; users have screen recorders | Out of scope v1; document as future consideration |
| Godot / Unity / other runtime targets | Each runtime is a separate project; dilutes focus | PixiJS only for v1; architecture JSON to be extensible |
| Bone physics / jiggle | Simulation system with spring/damping; complex; runtime must also support it | Out of scope v1 |
| Non-bone constraint types (path constraint, transform constraint) | Spine has these as advanced features; complex and rarely needed by beginners | IK is already deferred; path/transform constraints are v3+ |
| Plugin / extension system | Premature architecture; adds API surface to maintain | Hard-code the features that matter |
| Paid features or paywalls | Defeats the core value prop vs. Spine | Always free; monetize via GitHub sponsors or donations later |
| Rive-style interactive state machine | Different product category; requires runtime state graph | Pure keyframe animation only for v1 |

---

## Feature Dependencies

```
Image Import
  └── Image Attachment to Bones
        └── Slot / Draw Order System

Bone Creation
  └── Parent-Child Hierarchy
        └── Recursive Transform Math
              ├── Pose Mode (setup pose baseline)
              │     └── Animate Mode
              │           ├── Keyframe System (per bone, per property)
              │           │     ├── Timeline Scrubbing
              │           │     ├── Linear Interpolation
              │           │     ├── Stepped Interpolation (differentiator)
              │           │     └── Bezier Easing (differentiator, high cost)
              │           └── Named Animations
              │                 └── Multiple Animations per Skeleton
              └── Bone Constraints (IK) — v2+

Named Animations
  └── JSON Export
        └── PixiJS Runtime (separate library, consumes JSON)

Undo/Redo
  └── (applies to all edit operations — must be designed in from day 1)

Animation Events
  └── JSON Export (events embedded in timeline data)
  └── PixiJS Runtime (runtime dispatches events to game code)
```

---

## MVP Recommendation

**Minimum viable for a user to rig a character, animate it, and use it in a PixiJS game:**

Prioritize:
1. Bone creation, hierarchy, and viewport manipulation (move/rotate/scale)
2. Image import and attachment to bones with draw-order control
3. Pose mode / animate mode split
4. Keyframe system with linear and stepped interpolation
5. Timeline scrubbing and real-time playback
6. Named animations (idle, walk, attack)
7. JSON export (full project + animation data)
8. PixiJS runtime (plays the JSON in a game)
9. Undo/Redo (non-negotiable; must ship with this)
10. Save/load project (localStorage + download/upload)

**Deferred to v1.1 (ship after initial release based on user feedback):**
- Bezier easing curve editor (high cost, medium demand)
- Animation events / markers (medium cost, high value for game devs)
- Onion skinning (medium cost, niche demand)
- Skin sets (high cost, high value for RPG devs)
- Grid and snap (low cost — may be bumped to v1 if fast)
- Copy/paste keyframes (medium cost — if timeline work allows)

**Deferred to v2:**
- IK (Inverse Kinematics) — marks the largest single UX improvement
- Skin / skin set system (full implementation)

---

## Feature Complexity Reference

**Low:** 1–3 days. Straightforward implementation, no novel sub-systems.
**Medium:** 1–2 weeks. Requires careful data model design or non-trivial UI.
**High:** 2–4 weeks. Sub-system in its own right; requires dedicated design phase.
**Very High:** 1+ months. Spine spent years on IK/mesh. Do not underestimate.

---

## Confidence Assessment

| Area | Confidence | Notes |
|------|------------|-------|
| Table stakes list | HIGH | These are consistent across Spine, DragonBones, COA Tools; well-established |
| Differentiators list | MEDIUM | IK, events, and skins are confirmed Spine features; popularity ranking inferred from community knowledge |
| Anti-features rationale | HIGH | Mesh deformation and sprite packing complexity are well-documented; out-of-scope rationale is sound |
| Complexity estimates | MEDIUM | Based on comparable open-source editor implementations; individual implementation may vary |
| PixiJS runtime scope | MEDIUM | pixi-spine API patterns are known; custom runtime complexity depends on feature set chosen |

---

## Sources

- Spine 2D feature set: training knowledge through mid-2025; Esoteric Software docs (https://esotericsoftware.com/spine-features)
- DragonBones: training knowledge; official Egret documentation
- Rive: training knowledge through mid-2025; https://rive.app/features
- PixiJS ecosystem gap (pixi-spine / no free alternative): stated in PROJECT.md and confirmed by community knowledge
- Complexity estimates: informed by open-source 2D skeletal editor projects (AnimeJS editor experiments, COA Tools Blender add-on, open-source Spine-like tools on GitHub)

**Note:** External web verification was unavailable during this research session. The table stakes and anti-feature lists should be treated as HIGH confidence based on training data depth, but the differentiator complexity estimates and popularity rankings are MEDIUM confidence and should be validated against current community feedback (itch.io forums, r/gamedev, PixiJS Discord) before finalizing roadmap priorities.
