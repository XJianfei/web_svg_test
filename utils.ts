
export interface Point {
  x: number;
  y: number;
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

// Parse simple SVG path commands (M, L, Q, Z) and flatten to a dense polygon
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

// Find intersection of a line segment and a circle
function getIntersection(p1: Point, p2: Point, cx: number, cy: number, r: number): Point {
    const d = dist(p1, p2);
    if (d === 0) return p1;
    const v = { x: (p2.x - p1.x)/d, y: (p2.y - p1.y)/d };
    
    // Binary search for precision
    let start = 0;
    let end = d;
    for(let i=0; i<8; i++) {
        const mid = (start+end)/2;
        const testPt = { x: p1.x + v.x*mid, y: p1.y + v.y*mid };
        if (dist(testPt, {x:cx, y:cy}) < r) {
            // Mid is inside, we need to move towards the outside point
            // Assumption: one point is In, one is Out.
            if (dist(p1, {x:cx, y:cy}) < r) start = mid; else end = mid;
        } else {
            if (dist(p1, {x:cx, y:cy}) < r) end = mid; else start = mid;
        }
    }
    const finalMid = (start+end)/2;
    return { x: p1.x + v.x*finalMid, y: p1.y + v.y*finalMid };
}

// Split a list of points (Polygon/Stroke Outline) by a circle
export function splitPolygon(points: Point[], cx: number, cy: number, r: number): { path: string, points: Point[] }[] {
    if (points.length < 3) return [];

    const isOut = (p: Point) => dist(p, {x:cx, y:cy}) >= r;
    const status = points.map(isOut);

    // 1. All Out -> Return original
    if (status.every(s => s)) return [{ path: pointsToPath(points), points }];
    // 2. All In -> Return nothing
    if (status.every(s => !s)) return [];

    // 3. Mixed
    // Identify continuous segments of OUT points
    const segments: Point[][] = [];
    let currentSegment: Point[] = [];
    
    // To handle the cyclic nature, we find a rotation index where we transition In -> Out
    // If we can't find one (handled above by all in/all out), default 0.
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
    // Recalculate status for ordered to avoid index confusion
    const orderedStatus = orderedPoints.map(isOut);

    for (let i = 0; i < orderedPoints.length; i++) {
        const p = orderedPoints[i];
        const out = orderedStatus[i];

        if (out) {
            if (currentSegment.length === 0) {
                // Start of a new segment (Transition In -> Out)
                // Add intersection from previous (In) to current (Out)
                const prevIdx = (i - 1 + orderedPoints.length) % orderedPoints.length;
                const prev = orderedPoints[prevIdx];
                // Safety: if i=0 and we just started, prev is the last point.
                // Due to rotation, prev should be IN.
                const intersect = getIntersection(prev, p, cx, cy, r);
                currentSegment.push(intersect);
            }
            currentSegment.push(p);
        } else {
            if (currentSegment.length > 0) {
                // End of segment (Transition Out -> In)
                // Add intersection from previous (Out) to current (In)
                const prev = orderedPoints[i - 1];
                const intersect = getIntersection(prev, p, cx, cy, r);
                currentSegment.push(intersect);
                segments.push(currentSegment);
                currentSegment = [];
            }
        }
    }
    
    // If we end with an active segment, push it (shouldn't usually happen if we rotated correctly to end on an IN, 
    // but if the shape is complex or we hit the end of array)
    if (currentSegment.length > 0) {
        // Check if we need to wrap intersect (only if we didn't rotate, but we did)
        // Just close it with intersection to the start of wrap?
        // The logic above "orderedPoints" ensures we start at IN->OUT.
        // So the last point is either IN (segment closed) or OUT (array ended).
        // If array ended on OUT, it means the last point connects to the first point.
        // But we rotated so orderedPoints[0] is OUT and orderedPoints[-1] is IN.
        // So currentSegment should be empty at the end of loop.
        
        // Fallback just in case
         const firstPt = orderedPoints[0]; // The OUT point we started with
         const lastPtIn = orderedPoints[orderedPoints.length-1]; // Should be IN?
         // If last was OUT, then we circle back.
         if (orderedStatus[orderedPoints.length-1]) {
             // This means the whole thing was OUT? But we checked that.
             // Or calculation drift.
             segments.push(currentSegment);
         } else {
             // It was closed properly in the loop
             segments.push(currentSegment);
         }
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

// Split a polyline (Median) by a circle
export function splitPolyline(median: number[][], cx: number, cy: number, r: number): number[][][] {
    // 1. Subdivide to ensure good intersection
    const rawPoints = median.map(p => ({x: p[0], y: p[1]}));
    // Subdivide long segments to max 5px to ensure they can be caught by eraser
    const points = subdividePolyline(rawPoints, 5);
    
    const segments: number[][][] = [];
    let currentSegment: number[][] = [];
    
    for (let i = 0; i < points.length - 1; i++) {
        const p1 = points[i];
        const p2 = points[i+1];
        const d1 = dist(p1, {x:cx, y:cy});
        const d2 = dist(p2, {x:cx, y:cy});
        
        const out1 = d1 >= r;
        const out2 = d2 >= r;

        if (out1) {
            if (currentSegment.length === 0) currentSegment.push([p1.x, p1.y]);
            
            if (out2) {
                // Both out, keep segment
                currentSegment.push([p2.x, p2.y]);
            } else {
                // Out -> In
                const intersect = getIntersection(p1, p2, cx, cy, r);
                currentSegment.push([intersect.x, intersect.y]);
                segments.push(currentSegment);
                currentSegment = [];
            }
        } else {
            if (out2) {
                // In -> Out
                const intersect = getIntersection(p1, p2, cx, cy, r);
                currentSegment.push([intersect.x, intersect.y]);
                currentSegment.push([p2.x, p2.y]);
            }
            // Else both in, ignore
        }
    }
    
    if (currentSegment.length > 0) {
        // Filter tiny segments
        let len = 0;
        for(let k=0; k<currentSegment.length-1; k++) {
            len += dist({x:currentSegment[k][0], y:currentSegment[k][1]}, {x:currentSegment[k+1][0], y:currentSegment[k+1][1]});
        }
        if (len > 2) {
            segments.push(currentSegment);
        }
    }
    
    return segments;
}
