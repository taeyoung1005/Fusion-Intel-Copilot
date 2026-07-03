# Poly Pizza CARLA Staging Assets

These assets are staged for a future CARLA/Unreal custom-map import. They are
not spawned by the live CARLA Python bridge yet; CARLA can only spawn packaged
Unreal/CARLA blueprints at runtime.

Downloaded GLB files:

| Asset | File | Source | Author | License | Intended Use |
|---|---|---|---|---|---|
| Guard Tower | `guard-tower/guard-tower.glb` | https://poly.pizza/m/sbaM8I229r | Quaternius | CC0 1.0 | Perimeter watch point |
| Fence | `fence/fence.glb` | https://poly.pizza/m/JfSPlkPhRD | Quaternius | CC0 1.0 | Base boundary / checkpoint |
| Metal Fence | `metal-fence/metal-fence.glb` | https://poly.pizza/m/qWKhREFj7H | Quaternius | CC0 1.0 | Wire-fence perimeter |
| Sci Fi Ammo Crate | `ammo-crate/ammo-crate.glb` | https://poly.pizza/m/3alGXznksh | Dipper98 | CC0 1.0 | Ammo depot clutter |
| Crate | `crate/crate.glb` | https://poly.pizza/m/NlXe0ZJGUd | Quaternius | CC0 1.0 | Storage clutter |
| Shipping Container | `shipping-container/shipping-container.glb` | https://poly.pizza/m/dQXRtm5GbO | Quaternius | CC0 1.0 | Depot / container yard |
| Barrel | `barrel/barrel.glb` | https://poly.pizza/m/MraIiFnpAY | Quaternius | CC0 1.0 | Storage clutter |
| Tank | `tank/tank.glb` | https://poly.pizza/m/cW3zvvkMOM | Quaternius | CC0 1.0 | Static military vehicle prop |
| Sandbags | `sandbags/sandbags.glb` | https://poly.pizza/m/xClPIEQJdX | J-Toastie | CC-BY 3.0 | Checkpoint cover; attribution required |

## Import Path

1. Import these GLB files into Unreal Editor or CARLA's Unreal project.
2. Convert them to Static Mesh assets, set scale, collision, and material
   settings.
3. Build a small custom base scene: forest road, checkpoint, double fence,
   guard tower, ammo/container yard, and CCTV poles.
4. Package the map for CARLA.
5. Update `sim/carla-bridge/config.json` to load the packaged map and place
   cameras around the new scene.

Until that Unreal packaging step is done, the active CARLA bridge should keep
using built-in CARLA maps and blueprints for live camera streaming.
