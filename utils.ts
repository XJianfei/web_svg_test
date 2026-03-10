
export interface Point {
  x: number;
  y: number;
}

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export function isPointInRect(p: Point, rect: Rect): boolean {
  return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h;
}

// Calculate distance between two points
export const dist = (p1: Point, p2: Point) => Math.hypot(p1.x - p2.x, p1.y - p2.y);

// Linear Interpolation
const lerp = (p1: Point, p2: Point, t: number): Point => ({
  x: p1.x + (p2.x - p1.x) * t,
  y: p1.y + (p2.y - p1.y) * t,
});

// Subdivide a polyline so segments are not longer than maxLen
export function subdividePolyline(points: Point[], maxLen: number): Point[] {
    if (points.length < 2) return points;
    const newPoints: Point[] = [points[0]];
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        const d = dist(p1, p2);
        if (d > maxLen) {
            const count = Math.ceil(d / maxLen);
            for (let k = 1; k < count; k++) {
                newPoints.push(lerp(p1, p2, k / count));
            }
        }
        newPoints.push(p2);
    }
    return newPoints;
}

// Ray casting algorithm to check if point is in polygon
export function isPointInPolygon(p: Point, polygon: Point[]): boolean {
    let inside = false;
    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i].x, yi = polygon[i].y;
        const xj = polygon[j].x, yj = polygon[j].y;
        
        const intersect = ((yi > p.y) !== (yj > p.y))
            && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi);
        if (intersect) inside = !inside;
    }
    return inside;
}

export function getPolygonCentroid(points: Point[]): Point {
    let x = 0, y = 0;
    if (points.length === 0) return { x: 0, y: 0 };
    points.forEach(p => { x += p.x; y += p.y; });
    return { x: x / points.length, y: y / points.length };
}

// Parse simple SVG path commands (M, L, Q, C, Z) and flatten to a dense polygon
export function flattenSVGPath(d: string, sampleRate: number = 5): Point[] {
  const commands = d.match(/[a-zA-Z]|[\-+]?(?:\d+\.?\d*|\.?\d+)/g);
  if (!commands) return [];

  let points: Point[] = [];
  let current: Point = { x: 0, y: 0 };
  
  // Iterate through commands
  let i = 0;
  while (i < commands.length) {
    const cmd = commands[i];
    if (isNaN(Number(cmd))) {
       switch(cmd.toUpperCase()) {
         case 'M': // Move to
           current = { x: Number(commands[i+1]), y: Number(commands[i+2]) };
           points.push({ ...current });
           i += 3;
           break;
         case 'L': // Line to
           current = { x: Number(commands[i+1]), y: Number(commands[i+2]) };
           points.push({ ...current });
           i += 3;
           break;
         case 'Q': // Quadratic Bezier
           const cp = { x: Number(commands[i+1]), y: Number(commands[i+2]) }; // Control Point
           const ep = { x: Number(commands[i+3]), y: Number(commands[i+4]) }; // End Point
           
           const d = dist(current, ep);
           const steps = Math.max(2, Math.ceil(d / sampleRate));
           
           for (let t = 1; t <= steps; t++) {
             const ratio = t / steps;
             const inv = 1 - ratio;
             const x = inv*inv*current.x + 2*inv*ratio*cp.x + ratio*ratio*ep.x;
             const y = inv*inv*current.y + 2*inv*ratio*cp.y + ratio*ratio*ep.y;
             points.push({x, y});
           }
           current = ep;
           i += 5;
           break;
         case 'C': // Cubic Bezier
           const cp1 = { x: Number(commands[i+1]), y: Number(commands[i+2]) };
           const cp2 = { x: Number(commands[i+3]), y: Number(commands[i+4]) };
           const epC = { x: Number(commands[i+5]), y: Number(commands[i+6]) };
           
           const distC = dist(current, epC);
           const stepsC = Math.max(2, Math.ceil(distC / sampleRate));

           for (let t = 1; t <= stepsC; t++) {
             const ratio = t / stepsC;
             const inv = 1 - ratio;
             // Cubic Bezier Formula: (1-t)^3*P0 + 3*(1-t)^2*t*P1 + 3*(1-t)*t^2*P2 + t^3*P3
             const x = (inv*inv*inv * current.x) + 
                       (3 * inv*inv * ratio * cp1.x) + 
                       (3 * inv * ratio*ratio * cp2.x) + 
                       (ratio*ratio*ratio * epC.x);
             const y = (inv*inv*inv * current.y) + 
                       (3 * inv*inv * ratio * cp1.y) + 
                       (3 * inv * ratio*ratio * cp2.y) + 
                       (ratio*ratio*ratio * epC.y);
             points.push({x, y});
           }
           current = epC;
           i += 7;
           break;
          case 'Z': // Close path
             i += 1;
             break;
          default:
             i++;
       }
    } else {
      i++;
    }
  }
  return points;
}

// Find intersection of a line segment and a boundary (Binary Search variant - used for polygons)
function getIntersectionBinary(p1: Point, p2: Point, isInside: (p: Point) => boolean): Point {
    const d = dist(p1, p2);
    if (d === 0) return p1;
    const v = { x: (p2.x - p1.x)/d, y: (p2.y - p1.y)/d };
    
    // Binary search for precision
    let start = 0;
    let end = d;
    const p1Inside = isInside(p1);

    for(let i=0; i<12; i++) {
        const mid = (start+end)/2;
        const testPt = { x: p1.x + v.x*mid, y: p1.y + v.y*mid };
        if (isInside(testPt)) {
            if (p1Inside) start = mid; else end = mid;
        } else {
            if (p1Inside) end = mid; else start = mid;
        }
    }
    const finalMid = (start+end)/2;
    return { x: p1.x + v.x*finalMid, y: p1.y + v.y*finalMid };
}

// Analytical intersection for line segment (p1-p2) and circle (cx, cy, r)
// Returns sorted t values (0 < t < 1)
function getSegmentCircleIntersections(p1: Point, p2: Point, cx: number, cy: number, r: number): number[] {
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    const fx = p1.x - cx;
    const fy = p1.y - cy;
    
    const a = dx*dx + dy*dy;
    const b = 2 * (fx*dx + fy*dy);
    const c = (fx*fx + fy*fy) - r*r;
    
    const delta = b*b - 4*a*c;
    
    if (delta < 0) return [];
    
    const t1 = (-b - Math.sqrt(delta)) / (2*a);
    const t2 = (-b + Math.sqrt(delta)) / (2*a);
    
    const result: number[] = [];
    // Use smaller epsilon to catch intersections very close to endpoints
    const EPSILON = 1e-5;
    if (t1 > EPSILON && t1 < 1 - EPSILON) result.push(t1);
    if (t2 > EPSILON && t2 < 1 - EPSILON) result.push(t2);
    
    return result.sort((a,b) => a-b);
}

// Split a list of points (Polygon/Stroke Outline) by a circle
export function splitPolygon(points: Point[], cx: number, cy: number, r: number): { path: string, points: Point[] }[] {
    if (points.length < 3) return [];

    const isOut = (p: Point) => dist(p, {x:cx, y:cy}) >= r;
    const status = points.map(isOut);

    if (status.every(s => s)) return [{ path: pointsToPath(points), points }];
    if (status.every(s => !s)) return [];

    const segments: Point[][] = [];
    let currentSegment: Point[] = [];
    
    // Find start index (In -> Out transition) to correctly handle loop
    let startIndex = 0;
    for (let i = 0; i < points.length; i++) {
        const prevIdx = (i - 1 + points.length) % points.length;
        if (!status[prevIdx] && status[i]) {
            startIndex = i;
            break;
        }
    }

    const orderedPoints = [];
    for(let i=0; i<points.length; i++) {
        orderedPoints.push(points[(startIndex + i) % points.length]);
    }
    const orderedStatus = orderedPoints.map(isOut);

    for (let i = 0; i < orderedPoints.length; i++) {
        const p = orderedPoints[i];
        const out = orderedStatus[i];

        if (out) {
            if (currentSegment.length === 0) {
                // Start of new segment
                const prevIdx = (i - 1 + orderedPoints.length) % orderedPoints.length;
                const prev = orderedPoints[prevIdx];
                const intersect = getIntersectionBinary(prev, p, (pt) => dist(pt, {x:cx, y:cy}) < r);
                currentSegment.push(intersect);
            }
            currentSegment.push(p);
        } else {
            if (currentSegment.length > 0) {
                // End of segment
                const prev = orderedPoints[i - 1];
                const intersect = getIntersectionBinary(prev, p, (pt) => dist(pt, {x:cx, y:cy}) < r);
                currentSegment.push(intersect);
                segments.push(currentSegment);
                currentSegment = [];
            }
        }
    }
    
    if (currentSegment.length > 0) {
         segments.push(currentSegment);
    }

    return segments.map(pts => ({
        path: pointsToPath(pts),
        points: pts
    }));
}

export function pointsToPath(points: Point[]): string {
    if (points.length === 0) return "";
    const d = points.map((p, i) => `${i===0 ? 'M' : 'L'} ${p.x.toFixed(1)} ${p.y.toFixed(1)}`).join(' ');
    return d + " Z";
}

// Split a polyline (Median) by a circle using exact intersection
// Preserves original points and only adds new ones at cut locations
export function splitPolyline(median: number[][], cx: number, cy: number, r: number): number[][][] {
    const segments: number[][][] = [];
    let currentSegment: number[][] = [];

    for (let i = 0; i < median.length - 1; i++) {
        const p1 = { x: median[i][0], y: median[i][1] };
        const p2 = { x: median[i+1][0], y: median[i+1][1] };
        
        // Find intersection t-values
        const tValues = getSegmentCircleIntersections(p1, p2, cx, cy, r);
        
        // We iterate through sub-segments created by intersections
        // [Start (0), ...Intersections, End (1)]
        const checkPoints = [0, ...tValues, 1];
        
        for (let k = 0; k < checkPoints.length - 1; k++) {
            const tStart = checkPoints[k];
            const tEnd = checkPoints[k+1];
            
            const startPt = lerp(p1, p2, tStart);
            const endPt = lerp(p1, p2, tEnd);
            const midPt = lerp(p1, p2, (tStart + tEnd) / 2);
            
            // Check if this sub-segment is inside or outside
            const isInside = dist(midPt, {x: cx, y: cy}) < r;
            
            if (!isInside) {
                // OUTSIDE: Add to current segment
                if (currentSegment.length === 0) {
                    currentSegment.push([startPt.x, startPt.y]);
                } else {
                    // Check continuity to avoid duplicating points
                    const last = currentSegment[currentSegment.length-1];
                    // If startPt is effectively same as last, don't push
                    if (dist({x:last[0], y:last[1]}, startPt) > 0.1) {
                        currentSegment.push([startPt.x, startPt.y]);
                    }
                }
                currentSegment.push([endPt.x, endPt.y]);
            } else {
                // INSIDE: Cut breaks the segment
                if (currentSegment.length > 0) {
                    // Ensure we don't leave tiny specks
                    // Lowered threshold to allow small but valid segments
                    if (currentSegment.length > 1 || (currentSegment.length === 2 && dist({x:currentSegment[0][0], y:currentSegment[0][1]}, {x:currentSegment[1][0], y:currentSegment[1][1]}) > 0.1)) {
                         segments.push(currentSegment);
                    }
                    currentSegment = [];
                }
            }
        }
    }
    
    // Push remaining segment
    if (currentSegment.length > 0) {
         // Re-check minimum length for last segment
         if (currentSegment.length > 1 || (currentSegment.length === 2 && dist({x:currentSegment[0][0], y:currentSegment[0][1]}, {x:currentSegment[1][0], y:currentSegment[1][1]}) > 0.1)) {
             segments.push(currentSegment);
         }
    }
    
    return segments;
}

// Analytical intersection for line segment (p1-p2) and rect
function getSegmentRectIntersections(p1: Point, p2: Point, rect: Rect): number[] {
    const tValues: number[] = [];
    const dx = p2.x - p1.x;
    const dy = p2.y - p1.y;
    
    const checkEdge = (nx: number, ny: number, d: number, isX: boolean) => {
        const denom = nx*dx + ny*dy;
        if (Math.abs(denom) > 1e-6) {
            const t = (d - nx*p1.x - ny*p1.y) / denom;
            if (t > 1e-5 && t < 1 - 1e-5) {
                const pt = { x: p1.x + t*dx, y: p1.y + t*dy };
                if (isX) {
                    if (pt.y >= rect.y - 1e-5 && pt.y <= rect.y + rect.h + 1e-5) tValues.push(t);
                } else {
                    if (pt.x >= rect.x - 1e-5 && pt.x <= rect.x + rect.w + 1e-5) tValues.push(t);
                }
            }
        }
    };
    
    checkEdge(1, 0, rect.x, true); // Left
    checkEdge(1, 0, rect.x + rect.w, true); // Right
    checkEdge(0, 1, rect.y, false); // Top
    checkEdge(0, 1, rect.y + rect.h, false); // Bottom
    
    return tValues.sort((a,b) => a-b).filter((t, i, arr) => i === 0 || t - arr[i-1] > 1e-5);
}

// Split a list of points (Polygon/Stroke Outline) by a rect
export function splitPolygonByRect(points: Point[], rect: Rect): { path: string, points: Point[] }[] {
    if (points.length < 3) return [];

    const isOut = (p: Point) => !isPointInRect(p, rect);
    const status = points.map(isOut);

    if (status.every(s => s)) return [{ path: pointsToPath(points), points }];
    if (status.every(s => !s)) return [];

    const segments: Point[][] = [];
    let currentSegment: Point[] = [];
    
    let startIndex = 0;
    for (let i = 0; i < points.length; i++) {
        const prevIdx = (i - 1 + points.length) % points.length;
        if (!status[prevIdx] && status[i]) {
            startIndex = i;
            break;
        }
    }

    const orderedPoints = [];
    for(let i=0; i<points.length; i++) {
        orderedPoints.push(points[(startIndex + i) % points.length]);
    }
    const orderedStatus = orderedPoints.map(isOut);

    for (let i = 0; i < orderedPoints.length; i++) {
        const p = orderedPoints[i];
        const out = orderedStatus[i];

        if (out) {
            if (currentSegment.length === 0) {
                const prevIdx = (i - 1 + orderedPoints.length) % orderedPoints.length;
                const prev = orderedPoints[prevIdx];
                const intersect = getIntersectionBinary(prev, p, (pt) => isPointInRect(pt, rect));
                currentSegment.push(intersect);
            }
            currentSegment.push(p);
        } else {
            if (currentSegment.length > 0) {
                const prev = orderedPoints[i - 1];
                const intersect = getIntersectionBinary(prev, p, (pt) => isPointInRect(pt, rect));
                currentSegment.push(intersect);
                segments.push(currentSegment);
                currentSegment = [];
            }
        }
    }
    
    if (currentSegment.length > 0) {
         segments.push(currentSegment);
    }

    return segments.map(pts => ({
        path: pointsToPath(pts),
        points: pts
    }));
}

// Split a polyline (Median) by a rect
export function splitPolylineByRect(median: number[][], rect: Rect): number[][][] {
    const segments: number[][][] = [];
    let currentSegment: number[][] = [];

    for (let i = 0; i < median.length - 1; i++) {
        const p1 = { x: median[i][0], y: median[i][1] };
        const p2 = { x: median[i+1][0], y: median[i+1][1] };
        
        const tValues = getSegmentRectIntersections(p1, p2, rect);
        const checkPoints = [0, ...tValues, 1];
        
        for (let k = 0; k < checkPoints.length - 1; k++) {
            const tStart = checkPoints[k];
            const tEnd = checkPoints[k+1];
            
            const startPt = lerp(p1, p2, tStart);
            const endPt = lerp(p1, p2, tEnd);
            const midPt = lerp(p1, p2, (tStart + tEnd) / 2);
            
            const isInside = isPointInRect(midPt, rect);
            
            if (!isInside) {
                if (currentSegment.length === 0) {
                    currentSegment.push([startPt.x, startPt.y]);
                } else {
                    const last = currentSegment[currentSegment.length-1];
                    if (dist({x:last[0], y:last[1]}, startPt) > 0.1) {
                        currentSegment.push([startPt.x, startPt.y]);
                    }
                }
                currentSegment.push([endPt.x, endPt.y]);
            } else {
                if (currentSegment.length > 0) {
                    if (currentSegment.length > 1 || (currentSegment.length === 2 && dist({x:currentSegment[0][0], y:currentSegment[0][1]}, {x:currentSegment[1][0], y:currentSegment[1][1]}) > 0.1)) {
                         segments.push(currentSegment);
                    }
                    currentSegment = [];
                }
            }
        }
    }
    
    if (currentSegment.length > 0) {
         if (currentSegment.length > 1 || (currentSegment.length === 2 && dist({x:currentSegment[0][0], y:currentSegment[0][1]}, {x:currentSegment[1][0], y:currentSegment[1][1]}) > 0.1)) {
             segments.push(currentSegment);
         }
    }
    
    return segments;
}
