/**
 * Milestone 94: Camila probe objects.
 *
 * Spatial objects scattered in the Gómez Morín slice for the autonomous
 * explorer NPC (Camila) to discover. Each object carries ONLY properties /
 * affordances — never instructions about what to do with it. The point of
 * the experiment is to see what Camila does with them on her own.
 *
 * Objects are grouped into complementary clusters placed far apart, so
 * connecting them requires travel and inference (ball <-> goal, trash bag
 * <-> distant bin, puddle <-> bucket, bench <-> book, chalk <-> blank wall).
 *
 * Positions are in the UNITY scene frame (metres): X = east, Z = -north,
 * Y = up, origin at the scene origin. They mirror the layout built by
 * GomezMorinSceneBuilder (Wing Spot door -6.75, 0.24, 5.80; Elena counter
 * -10.90, 0.44, 12.85; Dollar 2 Go parcel X 36..54 / Z 8..22; Del Porvenir
 * road X ~13.5 / Z 0..45; La Arboleda X ~101 / Z 0..45).
 *
 * This module is intentionally standalone (no WorldState import): probe
 * objects are NOT part of the authoritative WorldState schema (v19) and
 * are NOT persisted there. They are scene props with an affordance
 * vocabulary, nothing more.
 */

export interface UnityPosition {
  readonly x: number;
  readonly y: number;
  readonly z: number;
}

export interface CamilaProbeObject {
  readonly id: string;
  readonly name: string;
  /** Nearest seed place id (logical location, for perception + routing). */
  readonly placeId: string;
  /** Cluster the object belongs to (its complement lives elsewhere). */
  readonly cluster: 'futbol' | 'basura' | 'agua' | 'descanso' | 'arte' | 'terreno';
  readonly unityPosition: UnityPosition;
  /** Properties / affordances only. Never an instruction. */
  readonly affordances: readonly string[];
  readonly description: string;
}

export const CAMILA_PROBE_OBJECTS: readonly CamilaProbeObject[] = Object.freeze([
  // --- Cluster: fútbol (ball <-> small goal <-> cones in open east lot of Dollar 2 Go) ---
  {
    id: 'probe:ball',
    name: 'Pelota',
    placeId: 'building:dollar-2-go-building',
    cluster: 'futbol',
    unityPosition: { x: 68, y: 0.345, z: 11.5 },
    affordances: ['round', 'rollable', 'kickable', 'movable', 'light'],
    description: 'Una pelota en la zona abierta del estacionamiento de Dollar 2 Go.',
  },
  {
    id: 'probe:small-goal',
    name: 'Portería pequeña',
    placeId: 'building:dollar-2-go-building',
    cluster: 'futbol',
    unityPosition: { x: 68, y: 0.12, z: 18 },
    affordances: ['frame', 'open', 'stationary', 'receives-rolling-objects'],
    description: 'Una portería pequeña en la zona libre del estacionamiento de Dollar 2 Go.',
  },
  {
    id: 'probe:cone-west',
    name: 'Cono oeste',
    placeId: 'building:dollar-2-go-building',
    cluster: 'futbol',
    unityPosition: { x: 65, y: 0.4, z: 14.5 },
    affordances: ['conical', 'movable', 'light', 'marks-a-line'],
    description: 'Un cono naranja en la zona abierta del estacionamiento de Dollar 2 Go.',
  },
  {
    id: 'probe:cone-east',
    name: 'Cono este',
    placeId: 'building:dollar-2-go-building',
    cluster: 'futbol',
    unityPosition: { x: 71, y: 0.4, z: 14.5 },
    affordances: ['conical', 'movable', 'light', 'marks-a-line'],
    description: 'Un cono naranja en la zona abierta del estacionamiento de Dollar 2 Go.',
  },
  // --- Cluster: basura (bag <-> distant bin <-> broom) ---
  {
    id: 'probe:trash-bag',
    name: 'Bolsa de basura',
    placeId: 'street:blvd-gomez-morin',
    cluster: 'basura',
    unityPosition: { x: 19.78, y: 0.24, z: 1.25 },
    affordances: ['movable', 'carriable', 'soft', 'contains-refuse'],
    description: 'Una bolsa de basura amarrada en la esquina de la banqueta este de Calle Del Porvenir y Blvd. Gómez Morín, junto al poste.',
  },
  {
    id: 'probe:trash-bin',
    name: 'Bote de basura',
    placeId: 'street:av-la-arboleda',
    cluster: 'basura',
    unityPosition: { x: 107.55, y: 0.24, z: 30 },
    affordances: ['container', 'openable', 'stationary', 'receives-refuse'],
    description: 'Un bote de basura lejano sobre la banqueta de Av. La Arboleda.',
  },
  {
    id: 'probe:broom',
    name: 'Escoba',
    placeId: 'building:tia-lupe-building',
    cluster: 'basura',
    unityPosition: { x: -18, y: 0.4, z: 6 },
    affordances: ['long-handle', 'movable', 'sweeps', 'leaning'],
    description: 'Una escoba apoyada en la fachada de Tía Lupe.',
  },
  // --- Cluster: agua (puddle <-> bucket + watering can <-> umbrella) ---
  {
    id: 'probe:puddle',
    name: 'Charco en bache',
    placeId: 'street:calle-del-porvenir',
    cluster: 'agua',
    unityPosition: { x: 13.5, y: 0.005, z: 25 },
    affordances: ['water', 'water-source', 'recessed-hole', 'fillable-with-sand', 'wets', 'splashes', 'reflective', 'stationary'],
    description: 'Un bache hundido en el asfalto con agua acumulada sobre Calle Del Porvenir.',
  },
  {
    id: 'probe:bucket',
    name: 'Cubeta',
    placeId: 'building:del-porvenir-residence',
    cluster: 'agua',
    unityPosition: { x: 7.15, y: 0.24, z: 33.1 },
    affordances: ['container', 'carriable', 'holds-water', 'holds-sand', 'scoops-sand'],
    description: 'Una cubeta en la banqueta junto a la Residencia Del Porvenir.',
  },
  {
    id: 'probe:watering-can',
    name: 'Regadera',
    placeId: 'building:del-porvenir-residence',
    cluster: 'agua',
    unityPosition: { x: 7.2, y: 0.24, z: 33.75 },
    affordances: ['container', 'carriable', 'pours-water'],
    description: 'Una regadera en la banqueta junto a la Residencia Del Porvenir.',
  },
  {
    id: 'probe:umbrella',
    name: 'Paraguas olvidado',
    placeId: 'street:blvd-gomez-morin',
    cluster: 'agua',
    unityPosition: { x: 59.46, y: 0.72, z: 2.42 },
    affordances: ['foldable', 'movable', 'shelters-from-water', 'forgotten'],
    description: 'Un paraguas olvidado sobre una banca del boulevard.',
  },
  // --- Cluster: descanso (bench <-> book <-> cup) ---
  {
    id: 'probe:bench',
    name: 'Banca',
    placeId: 'street:blvd-gomez-morin',
    cluster: 'descanso',
    unityPosition: { x: 60, y: 0.24, z: 2.4 },
    affordances: ['sittable', 'stationary', 'flat-surface'],
    description: 'Una banca metálica fija en la banqueta norte del boulevard.',
  },
  {
    id: 'probe:book',
    name: 'Libro / periódico',
    placeId: 'street:blvd-gomez-morin',
    cluster: 'descanso',
    unityPosition: { x: 60, y: 0.71, z: 2.4 },
    affordances: ['readable', 'movable', 'light', 'paper'],
    description: 'Un libro y un periódico sobre la banca.',
  },
  {
    id: 'probe:cup',
    name: 'Taza vacía',
    placeId: 'street:blvd-gomez-morin',
    cluster: 'descanso',
    unityPosition: { x: 60.48, y: 0.75, z: 2.4 },
    affordances: ['container', 'movable', 'empty', 'holds-liquid'],
    description: 'Una taza vacía sobre la banca.',
  },
  // --- Cluster: arte (chalk <-> blank wall) ---
  {
    id: 'probe:chalk',
    name: 'Gis de colores',
    placeId: 'street:blvd-gomez-morin',
    cluster: 'arte',
    unityPosition: { x: -8, y: 0.3, z: 2.4 },
    affordances: ['movable', 'light', 'draws-on-surfaces', 'colourful'],
    description: 'Gis de colores tirado en la banqueta frente a Wing Spot.',
  },
  {
    id: 'probe:blank-wall',
    name: 'Muro en blanco',
    placeId: 'building:wing-spot-building',
    cluster: 'arte',
    unityPosition: { x: -2.5, y: 1.2, z: 8 },
    affordances: ['flat', 'vertical', 'stationary', 'drawable-on'],
    description: 'Un muro en blanco en el costado este de Wing Spot.',
  },
  // --- East corridor landmarks & neutral probes (Corporativo Arboleda, Acabados HRC, CatZoo) ---
  {
    id: 'probe:orange-sculpture',
    name: 'Escultura metálica naranja',
    placeId: 'building:corporativo-arboleda-building',
    cluster: 'arte',
    unityPosition: { x: 113, y: 0.24, z: 5.4 },
    affordances: ['tall', 'geometric', 'hollow', 'orange-metal', 'stationary', 'sculptural'],
    description: 'Una escultura monumental de acero naranja formada por cinco módulos geométricos huecos apilados en la esquina del Corporativo Arboleda.',
  },
  {
    id: 'probe:tile-sample',
    name: 'Muestra de loseta',
    placeId: 'building:acabados-hbc-building',
    cluster: 'arte',
    unityPosition: { x: 82.8, y: 0.265, z: 3.15 },
    affordances: ['flat', 'ceramic', 'textured', 'movable', 'carriable'],
    description: 'Una muestra de loseta cerámica decorativa junto a la banqueta de Acabados HRC.',
  },
  {
    id: 'probe:cat-bowl',
    name: 'Plato de agua para gato',
    placeId: 'building:catzoo-building',
    cluster: 'agua',
    unityPosition: { x: 74.6, y: 0.24, z: 25.0 },
    affordances: ['container', 'holds-water', 'movable', 'carriable', 'small'],
    description: 'Un pequeño plato turquesa junto a la entrada de la clínica felina CatZoo.',
  },
  // --- Cluster: terreno (loose sand/earth mound + shovel in open west lot of Dollar 2 Go) ---
  {
    id: 'probe:sand-pile',
    name: 'Montículo de tierra y arena',
    placeId: 'building:dollar-2-go-building',
    cluster: 'terreno',
    unityPosition: { x: 27.5, y: 0.12, z: 11.2 },
    affordances: ['loose-sand', 'earth', 'scoopable', 'fills-holes', 'stationary'],
    description: 'Un montículo de tierra y arena suelta en la esquina oeste abierta del terreno de Dollar 2 Go.',
  },
  {
    id: 'probe:shovel',
    name: 'Pala',
    placeId: 'building:dollar-2-go-building',
    cluster: 'terreno',
    unityPosition: { x: 29.0, y: 0.12, z: 11.0 },
    affordances: ['long-handle', 'tool', 'scoops-sand', 'holds-sand', 'movable', 'carriable'],
    description: 'Una pala metálica con mango de madera apoyada junto al montículo de tierra en Dollar 2 Go.',
  },
]);

export function findProbeObjectById(id: string): CamilaProbeObject | null {
  if (typeof id !== 'string' || id.trim() === '') return null;
  return CAMILA_PROBE_OBJECTS.find((o) => o.id === id) ?? null;
}

export function findProbeObjectsByPlace(placeId: string): CamilaProbeObject[] {
  return CAMILA_PROBE_OBJECTS.filter((o) => o.placeId === placeId);
}

export function findProbeObjectsByCluster(
  cluster: CamilaProbeObject['cluster']
): CamilaProbeObject[] {
  return CAMILA_PROBE_OBJECTS.filter((o) => o.cluster === cluster);
}
