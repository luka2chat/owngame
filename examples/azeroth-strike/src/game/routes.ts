import type { NavGraph, Point } from '../world/nav'

/** A way across the map as sparse waypoints, start to end. */
export type Route = { points: Point[]; length: number }

/** Yards between route waypoints. */
const SPACING = 16

/**
 * Up to `count` genuinely different routes from `from` to `to`. The first is the shortest; each
 * later one is the shortest path that keeps off the ground earlier routes cover (`width` yards to
 * either side). The ends are left alone because every route has to leave and reach the same base.
 * A candidate that still runs mostly over an earlier route, or is far longer than the shortest,
 * is dropped, so a map with a single corridor yields a single route.
 */
export async function findRoutes(
  nav: NavGraph,
  from: Point,
  to: Point,
  { count = 3, width = 18, maxDetour = 1.9, pause }: { count?: number; width?: number; maxDetour?: number; pause?: () => Promise<void> } = {},
): Promise<Route[]> {
  const penalty = new Float32Array(nav.count)
  const routes: Route[] = []
  const ends = width * 1.6
  const nearEnd = (n: number) =>
    Math.hypot(nav.x[n] - from.x, nav.z[n] - from.z) < ends || Math.hypot(nav.x[n] - to.x, nav.z[n] - to.z) < ends
  for (let k = 0; k < count; k++) {
    if (k) await pause?.()
    // Penalties make the search expand far more nodes than a plain shortest path.
    const nodes = nav.findNodes(from, to, nav.count * 8, penalty)
    if (!nodes) break
    const inner = nodes.filter(n => !nearEnd(n))
    const reused = inner.filter(n => penalty[n] > 0).length / Math.max(1, inner.length)
    const route = sample(nav, nodes)
    if (routes.length && (reused > 0.45 || route.length > routes[0].length * maxDetour)) break
    routes.push(route)
    for (let i = 0; i < inner.length; i += 2) for (const m of nav.nodesNear(nav.x[inner[i]], nav.z[inner[i]], width)) penalty[m] = 5
  }
  return routes
}

function sample(nav: NavGraph, nodes: number[]): Route {
  const points: Point[] = [nav.point(nodes[0])]
  let length = 0
  let since = 0
  for (let i = 1; i < nodes.length; i++) {
    const step = Math.hypot(nav.x[nodes[i]] - nav.x[nodes[i - 1]], nav.z[nodes[i]] - nav.z[nodes[i - 1]])
    length += step
    since += step
    if (since >= SPACING || i === nodes.length - 1) {
      points.push(nav.point(nodes[i]))
      since = 0
    }
  }
  return { points, length }
}

/** The same route walked the other way. */
export const reversed = (r: Route): Route => ({ points: [...r.points].reverse(), length: r.length })

/** Point `t` (0..1) of the way along a route, by waypoint count. */
export const along = (r: Route, t: number): Point => r.points[Math.min(r.points.length - 1, Math.max(0, Math.round(t * (r.points.length - 1))))]
