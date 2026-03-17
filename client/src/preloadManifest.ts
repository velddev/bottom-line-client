/**
 * Centralized manifest of all 3D model paths for preloading.
 * Imported eagerly in App.tsx so loading begins immediately.
 */
import { ALL_MODEL_PATHS } from './components/buildingVariants';

// Vehicle models
const VEHICLE_MODELS = [
  '/models/vehicles/van.glb',
  '/models/vehicles/truck.glb',
  '/models/vehicles/truck-flat.glb',
  '/models/vehicles/taxi.glb',
  '/models/vehicles/suv.glb',
  '/models/vehicles/sedan.glb',
  '/models/vehicles/sedan-sports.glb',
  '/models/vehicles/delivery.glb',
  '/models/vehicles/delivery-flat.glb',
];

// Farm & animal models
const FARM_MODELS = [
  '/models/animals/animal-cow.glb',
  '/models/buildings/farm/graveyard/grave.glb',
  '/models/buildings/farm/pirate/grass.glb',
  '/models/buildings/farm/pirate/grass-plant.glb',
  '/models/buildings/farm/grass.glb',
];

// Environment models
const ENV_MODELS = [
  '/models/nature/hedge.glb',
  '/models/roads/road-straight.glb',
  '/models/selection/selection-a.glb',
];

/** Every asset URL the game needs before first render */
export const ALL_PRELOAD_URLS: string[] = [
  ...new Set([
    ...ALL_MODEL_PATHS,
    ...VEHICLE_MODELS,
    ...FARM_MODELS,
    ...ENV_MODELS,
  ]),
];
