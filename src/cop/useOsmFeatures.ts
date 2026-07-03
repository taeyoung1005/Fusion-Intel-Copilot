import { OSM_FEATURES, type OsmFeatures } from "./osmFeatures"

// The real OSM building/road geometry is bundled and projected at module load,
// so this is a synchronous, always-available lookup (no network at render time).
export const useOsmFeatures = (): OsmFeatures => OSM_FEATURES
