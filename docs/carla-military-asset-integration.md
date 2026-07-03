# CARLA Military Perimeter Asset Integration

## Current Status

The project now has a local staging pack of free military/perimeter-style GLB
assets under `assets/external/poly-pizza/`.

These assets cover the first visual pass for a military perimeter scene:

- wire/metal fence
- guard tower
- sandbags
- ammo/storage crates
- shipping container
- barrel
- static tank prop

They are source assets, not live CARLA runtime assets yet.

## Why They Are Not Live In CARLA Yet

CARLA's Python API can spawn existing CARLA blueprints at runtime, such as
vehicles, walkers, traffic signs, and built-in static props. It cannot directly
load arbitrary `.glb` files from disk into a running CARLA world.

To make these assets appear in the live CCTV feed, they must be imported into
Unreal/CARLA first:

1. Import GLB files into Unreal Editor.
2. Convert them into Static Mesh assets.
3. Configure scale, materials, and collision.
4. Place them into a custom CARLA map or sublevel.
5. Package the custom map.
6. Run CARLA with that packaged map.
7. Point `sim/carla-bridge/config.json` at the custom map and camera positions.

## Practical Implementation Route

### Phase 1: Continue Live Prototype With Built-In CARLA

Use the current Python bridge and built-in CARLA maps for live moving footage:

- moving pedestrians
- moving/parked vehicles
- checkpoint-like camera placement
- round-robin CCTV feeds into D4D
- real DETR inference in the dashboard

This keeps the demo live and testable today.

### Phase 2: Build The Custom Perimeter Map

Use the staged Poly Pizza assets as the base kit for a custom map:

- double fence line around an ammo/storage area
- gate/checkpoint with guard tower
- wooded outer approach road
- parked military vehicle/tank as a static visual cue
- containers, crates, barrels, and sandbags near the depot
- 4-6 elevated CCTV camera poles aimed across the fence and storage yard

### Phase 3: Swap CARLA Map Source

Once packaged, update the CARLA bridge config:

- `world`: custom packaged map name
- `cameras`: fixed camera transforms around the perimeter
- `walkers`: patrol and intrusion paths through the fence/gate area
- `vehicles`: slow patrol/utility vehicles around the depot

The D4D dashboard does not need another architecture change. It already accepts
multi-camera CARLA frames through `/api/carla-cameras/:id/frame`.

## Licensing Notes

Most staged assets are CC0 1.0 and can be used without attribution. The
`sandbags` asset is CC-BY 3.0, so any distributable demo or public material
using that asset should credit J-Toastie and link to the source page.

Full per-file source and license details are in
`assets/external/poly-pizza/README.md`.
