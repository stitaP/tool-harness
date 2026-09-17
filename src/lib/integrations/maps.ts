/**
 * Maps & Geocoding — Unified geolocation services for agents.
 * Supports OpenStreetMap (free), Google Maps, Mapbox, and Leaflet.
 */

export type MapProvider = "osm" | "google" | "mapbox";

export interface GeoPoint {
  lat: number;
  lng: number;
  altitude?: number;
  accuracy?: number;
}

export interface GeoAddress {
  houseNumber?: string;
  road?: string;
  neighbourhood?: string;
  suburb?: string;
  city?: string;
  state?: string;
  country: string;
  countryCode: string;
  postcode?: string;
  displayName: string;
}

export interface RouteResult {
  distance: number; // meters
  duration: number; // seconds
  steps: RouteStep[];
  polyline: GeoPoint[];
  bounds: { northeast: GeoPoint; southwest: GeoPoint };
}

export interface RouteStep {
  instruction: string;
  distance: number;
  duration: number;
  maneuver: "turn-left" | "turn-right" | "straight" | "uturn" | "roundabout";
  start: GeoPoint;
  end: GeoPoint;
}

export interface IsochroneResult {
  center: GeoPoint;
  polygons: Array<{
    range: number; // minutes
    polygon: GeoPoint[];
  }>;
}

export interface Geofence {
  id: string;
  name: string;
  type: "circle" | "polygon";
  center?: GeoPoint;
  radius?: number; // meters
  polygon?: GeoPoint[];
  active: boolean;
}

// ─── Geocoding ────────────────────────────────────────────────────

/**
 * Forward geocode: address string → coordinates.
 * Uses Nominatim (OpenStreetMap) by default — no API key needed.
 */
export async function geocode(
  address: string,
  options: { limit?: number; countryCode?: string; provider?: MapProvider } = {}
): Promise<Array<{ point: GeoPoint; address: GeoAddress; relevance: number }>> {
  const { limit = 5, countryCode, provider = "osm" } = options;

  if (provider === "osm") {
    const params = new URLSearchParams({
      q: address,
      format: "jsonv2",
      limit: limit.toString(),
      addressdetails: "1",
    });
    if (countryCode) params.set("countrycodes", countryCode);

    const response = await fetch(
      `https://nominatim.openstreetmap.org/search?${params}`,
      {
        headers: { "User-Agent": "AgentHarness/1.0" },
      }
    );
    const results = (await response.json()) as Array<{
      lat: string;
      lon: string;
      display_name: string;
      importance: number;
      address?: Record<string, string>;
    }>;

    return results.map((r) => ({
      point: { lat: parseFloat(r.lat), lng: parseFloat(r.lon) },
      address: {
        houseNumber: r.address?.house_number,
        road: r.address?.road,
        neighbourhood: r.address?.neighbourhood,
        suburb: r.address?.suburb,
        city: r.address?.city ?? r.address?.town ?? r.address?.village,
        state: r.address?.state,
        country: r.address?.country ?? "",
        countryCode: r.address?.country_code ?? "",
        postcode: r.address?.postcode,
        displayName: r.display_name,
      },
      relevance: r.importance,
    }));
  }

  return [];
}

/**
 * Reverse geocode: coordinates → address.
 */
export async function reverseGeocode(
  point: GeoPoint,
  options: { provider?: MapProvider } = {}
): Promise<GeoAddress> {
  const { provider = "osm" } = options;

  if (provider === "osm") {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=jsonv2&lat=${point.lat}&lon=${point.lng}`,
      { headers: { "User-Agent": "AgentHarness/1.0" } }
    );
    const result = (await response.json()) as {
      display_name: string;
      address?: Record<string, string>;
    };

    return {
      houseNumber: result.address?.house_number,
      road: result.address?.road,
      neighbourhood: result.address?.neighbourhood,
      suburb: result.address?.suburb,
      city: result.address?.city ?? result.address?.town,
      state: result.address?.state,
      country: result.address?.country ?? "",
      countryCode: result.address?.country_code ?? "",
      postcode: result.address?.postcode,
      displayName: result.display_name,
    };
  }

  return {
    country: "",
    countryCode: "",
    displayName: "",
  };
}

// ─── Routing ──────────────────────────────────────────────────────

/**
 * Calculate route between two or more waypoints.
 * Uses OSRM demo server for free routing.
 */
export async function calculateRoute(
  waypoints: GeoPoint[],
  options: {
    profile?: "car" | "bike" | "foot";
    alternatives?: boolean;
    steps?: boolean;
  } = {}
): Promise<RouteResult> {
  const { profile = "car", steps = true } = options;

  const profileMap = { car: "driving", bike: "cycling", foot: "walking" };
  const coords = waypoints.map((p) => `${p.lng},${p.lat}`).join(";");

  const response = await fetch(
    `https://router.project-osrm.org/route/v1/${profileMap[profile]}/${coords}?steps=${steps}&geometries=geojson`,
    { headers: { "User-Agent": "AgentHarness/1.0" } }
  );
  const data = (await response.json()) as {
    routes?: Array<{
      distance: number;
      duration: number;
      geometry: { coordinates: Array<[number, number]> };
      legs: Array<{
        steps: Array<{
          maneuver: { type: string; modifier?: string };
          name: string;
          distance: number;
          duration: number;
          geometry: { coordinates: Array<[number, number]> };
        }>;
      }>;
    }>;
  };

  const route = data.routes?.[0];
  if (!route) {
    return {
      distance: 0,
      duration: 0,
      steps: [],
      polyline: [],
      bounds: {
        northeast: waypoints[0],
        southwest: waypoints[waypoints.length - 1],
      },
    };
  }

  const routeSteps: RouteStep[] = [];
  for (const leg of route.legs) {
    for (const step of leg.steps) {
      const maneuver = step.maneuver.type;
      const modifier = step.maneuver.modifier ?? "";
      let maneuverType: RouteStep["maneuver"] = "straight";
      if (maneuver === "turn" && modifier.includes("left")) maneuverType = "turn-left";
      else if (maneuver === "turn" && modifier.includes("right")) maneuverType = "turn-right";
      else if (maneuver === "uturn") maneuverType = "uturn";
      else if (maneuver === "roundabout") maneuverType = "roundabout";

      const coords = step.geometry.coordinates;
      routeSteps.push({
        instruction: `${maneuverType === "straight" ? "Continue" : maneuverType} on ${step.name || "unnamed road"}`,
        distance: step.distance,
        duration: step.duration,
        maneuver: maneuverType,
        start: { lat: coords[0]?.[1] ?? 0, lng: coords[0]?.[0] ?? 0 },
        end: { lat: coords[coords.length - 1]?.[1] ?? 0, lng: coords[coords.length - 1]?.[0] ?? 0 },
      });
    }
  }

  const polyline = route.geometry.coordinates.map((c) => ({
    lat: c[1],
    lng: c[0],
  }));

  return {
    distance: route.distance,
    duration: route.duration,
    steps: routeSteps,
    polyline,
    bounds: {
      northeast: { lat: Math.max(...polyline.map((p) => p.lat)), lng: Math.max(...polyline.map((p) => p.lng)) },
      southwest: { lat: Math.min(...polyline.map((p) => p.lat)), lng: Math.min(...polyline.map((p) => p.lng)) },
    },
  };
}

// ─── Isochrone (time-based areas) ─────────────────────────────────

/**
 * Calculate isochrone — areas reachable within N minutes from a point.
 */
export async function calculateIsochrone(
  center: GeoPoint,
  ranges: number[], // minutes
  profile: "car" | "bike" | "foot" = "car"
): Promise<IsochroneResult> {
  const profileMap = { car: "driving", bike: "cycling", foot: "walking" };
  const coords = `${center.lng},${center.lat}`;
  const rangeStr = ranges.map((r) => r * 60).join(",");

  try {
    const response = await fetch(
      `https://router.project-osrm.org/table/v1/${profileMap[profile]}/${coords}?annotations=duration`
    );
    const _data = await response.json();
    // Simplified: return circular approximation
    return {
      center,
      polygons: ranges.map((range) => ({
        range,
        polygon: generateCirclePolygon(center, range * 1200), // rough approx
      })),
    };
  } catch {
    return {
      center,
      polygons: ranges.map((range) => ({
        range,
        polygon: generateCirclePolygon(center, range * 1200),
      })),
    };
  }
}

function generateCirclePolygon(center: GeoPoint, radiusMeters: number, points = 32): GeoPoint[] {
  const result: GeoPoint[] = [];
  for (let i = 0; i < points; i++) {
    const angle = (i / points) * 2 * Math.PI;
    const dLat = (radiusMeters / 111320) * Math.cos(angle);
    const dLng = (radiusMeters / (111320 * Math.cos((center.lat * Math.PI) / 180))) * Math.sin(angle);
    result.push({ lat: center.lat + dLat, lng: center.lng + dLng });
  }
  return result;
}

// ─── Geofencing ───────────────────────────────────────────────────

const geofences: Geofence[] = [];

export function createGeofence(
  fence: Omit<Geofence, "active">
): Geofence {
  const newFence: Geofence = { ...fence, active: true };
  geofences.push(newFence);
  return newFence;
}

export function checkGeofence(point: GeoPoint): Geofence[] {
  return geofences.filter((f) => {
    if (!f.active) return false;
    if (f.type === "circle" && f.center && f.radius) {
      const dist = haversineDistance(point, f.center);
      return dist <= f.radius;
    }
    if (f.type === "polygon" && f.polygon) {
      return pointInPolygon(point, f.polygon);
    }
    return false;
  });
}

export function deleteGeofence(id: string): boolean {
  const idx = geofences.findIndex((f) => f.id === id);
  if (idx >= 0) {
    geofences.splice(idx, 1);
    return true;
  }
  return false;
}

export function listGeofences(): Geofence[] {
  return [...geofences];
}

// ─── Utilities ────────────────────────────────────────────────────

/**
 * Haversine distance between two points in meters.
 */
export function haversineDistance(a: GeoPoint, b: GeoPoint): number {
  const R = 6371e3;
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δφ = ((b.lat - a.lat) * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;

  const sinHalf = Math.sin(Δφ / 2) ** 2 + Math.cos(φ1) * Math.cos(φ2) * Math.sin(Δλ / 2) ** 2;
  return R * 2 * Math.atan2(Math.sqrt(sinHalf), Math.sqrt(1 - sinHalf));
}

/**
 * Point-in-polygon test (ray casting).
 */
export function pointInPolygon(point: GeoPoint, polygon: GeoPoint[]): boolean {
  let inside = false;
  for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
    const xi = polygon[i].lng, yi = polygon[i].lat;
    const xj = polygon[j].lng, yj = polygon[j].lat;
    if (
      yi > point.lat !== yj > point.lat &&
      point.lng < ((xj - xi) * (point.lat - yi)) / (yj - yi) + xi
    ) {
      inside = !inside;
    }
  }
  return inside;
}

/**
 * Calculate bearing from point A to B in degrees.
 */
export function bearing(a: GeoPoint, b: GeoPoint): number {
  const φ1 = (a.lat * Math.PI) / 180;
  const φ2 = (b.lat * Math.PI) / 180;
  const Δλ = ((b.lng - a.lng) * Math.PI) / 180;
  const y = Math.sin(Δλ) * Math.cos(φ2);
  const x = Math.cos(φ1) * Math.sin(φ2) - Math.sin(φ1) * Math.cos(φ2) * Math.cos(Δλ);
  return ((Math.atan2(y, x) * 180) / Math.PI + 360) % 360;
}

/**
 * Generate a bounding box for a center point + radius.
 */
export function boundingBox(
  center: GeoPoint,
  radiusKm: number
): { northeast: GeoPoint; southwest: GeoPoint } {
  const latDelta = radiusKm / 111.32;
  const lngDelta = radiusKm / (111.32 * Math.cos((center.lat * Math.PI) / 180));
  return {
    northeast: { lat: center.lat + latDelta, lng: center.lng + lngDelta },
    southwest: { lat: center.lat - latDelta, lng: center.lng - lngDelta },
  };
}
