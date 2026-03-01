# BoneForge2D

## What This Is

BoneForge2D is a browser-based 2D skeletal animation editor for indie game developers and hobbyists. Users import sprite images, build bone hierarchies, attach images to bones, create keyframe animations, preview them in real time, and export a custom JSON format for playback via a bundled PixiJS runtime.

## Core Value

A solo indie dev can rig a character, animate it, and drop it into their PixiJS game — for free, in the browser, without a Spine license.

## Requirements

### Validated

(None yet — ship to validate)

### Active

- [ ] User can create a new skeletal animation project in the browser
- [ ] User can import images (PNG/JPG) into the project
- [ ] User can create bones and arrange them into a parent-child hierarchy
- [ ] User can attach images to bones as skin attachments
- [ ] User can manipulate bone transforms (position, rotation, scale) in a canvas viewport
- [ ] User can create named animations per skeleton
- [ ] User can add keyframes for bone transforms (position, rotation, scale)
- [ ] User can scrub a timeline and preview animations in real time
- [ ] User can adjust interpolation between keyframes (at minimum linear and stepped)
- [ ] User can manage multiple animations per skeleton
- [ ] User can export the skeleton + animations as a custom JSON file
- [ ] A PixiJS runtime is provided that loads the JSON and plays back animations in a PixiJS game

### Out of Scope

- Godot / Unity / other engine runtimes — PixiJS first; expand if project gains traction
- Mesh deformation / free-form deformation — bone-based only for v1
- Collaborative editing / cloud sync — local browser tool for v1
- Sprite sheet packing — user provides individual image files

## Context

- Spine (the dominant tool) costs $69–$299 per license plus runtime royalties — prohibitive for solo devs and hobbyists
- DragonBones is free but poorly maintained and has a clunky UX; Creature2D is abandoned
- The PixiJS ecosystem has `pixi-spine` but it requires Spine exports; no good free alternative exists
- Target users are building web games or browser-based apps with PixiJS
- Export format will be custom (not Spine-compatible) to avoid license constraints

## Constraints

- **Tech Stack**: React + TypeScript + Canvas/WebGL for the editor viewport — already decided
- **Target Runtime**: PixiJS — export format must be designed around PixiJS playback
- **Platform**: Browser only for v1 — no Electron, no file system APIs beyond download/upload
- **Licensing**: Must be free to use; custom JSON format avoids Spine license issues

## Key Decisions

| Decision | Rationale | Outcome |
|----------|-----------|---------|
| Custom JSON format (not Spine-compatible) | Avoids Spine runtime license requirements; freedom to design for PixiJS | — Pending |
| Browser-only (web app) | No install barrier; fits target audience of hobbyists | — Pending |
| PixiJS as first runtime target | Large web game audience; pixi-spine gap creates clear demand | — Pending |

---
*Last updated: 2026-02-28 after initialization*
