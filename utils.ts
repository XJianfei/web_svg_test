// utils.ts

// ============================================================================
// 橡皮擦擦除与拆分功能核心算法说明
// ============================================================================
// 流程概述：
// 1. 碰撞检测：当用户点击画布时，获取点击位置，构造一个矩形橡皮擦 (Rect)。
// 2. 粗略筛选：遍历汉字的所有笔画，计算笔画中轴线 (Median) 与橡皮擦的距离。如果距离太远，直接跳过。
// 3. 切断中轴线 (splitPolylineByRect)：
//    - 遍历中轴线上的每一个线段，计算它与橡皮擦矩形四条边的交点。
//    - 将位于矩形内部的线段删除。
//    - 在矩形边界处生成新的端点，从而将一条中轴线切断成多条短的中轴线。
// 4. 切断轮廓 (splitPolygonByRect)：
//    - 将 SVG Path 转换（展平）为多边形点集 (flattenSVGPath)。
//    - 遍历多边形的点，删除位于矩形内部的点。
//    - 当轮廓线穿过矩形边界时，使用二分法 (getIntersectionBinary) 找到精确的交点。
//    - 将这些交点沿着矩形边界连接起来，形成闭合的切口，从而将一个大轮廓分裂成多个小轮廓。
// 5. 重新匹配 (eraseAt)：
//    - 因为一个笔画被切成了多个新轮廓和多个新中轴线，我们需要将它们重新组合。
//    - 算法通过判断“中轴线上的点是否在轮廓多边形内部”或“中轴线与轮廓质心的距离”，将新生成的中轴线分配给对应的新轮廓。
// 6. 更新数据：将拆分后的新笔画替换掉原来的旧笔画，触发 React 重新渲染和动画。
// ============================================================================

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

// Linear Interpolation (线性插值)
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
// 射线法判断点是否在多边形内
// 原理：从目标点向右发出一条水平射线，统计这条射线与多边形边界的交点个数。
// 如果交点数为奇数，则点在多边形内部；如果为偶数，则在外部。
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

// 获取多边形的质心 (Centroid)
// 简单地将所有顶点的坐标求平均值。用于在复杂情况下匹配轮廓和中轴线。
export function getPolygonCentroid(points: Point[]): Point {
    let x = 0, y = 0;
    if (points.length === 0) return { x: 0, y: 0 };
    points.forEach(p => { x += p.x; y += p.y; });
    return { x: x / points.length, y: y / points.length };
}

// Parse simple SVG path commands (M, L, Q, C, Z) and flatten to a dense polygon
// 将 SVG Path 字符串展平 (Flatten) 为离散的点集。
// 核心算法：
// 1. 解析 SVG 指令 (M, L, Q, C, Z)。
// 2. 根据指定的采样率 (sampleRate)，将直线和贝塞尔曲线插值成一系列密集的点。
// 3. 这样复杂的曲线轮廓就变成了一个简单的多边形，方便后续进行几何碰撞和裁剪计算。
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

/**
 * 查找线段与边界的交点 (二分查找变体 - 用于处理多边形轮廓)
 * 原理：已知线段的一个端点在矩形外，另一个在矩形内。
 * 通过不断取中点，判断中点是否在矩形内，从而逼近线段与矩形边界的精确交点。
 */
export const getIntersectionBinary = (p1: Point, p2: Point, isInside: (p: Point) => boolean): Point => {
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
// 解析几何计算线段 (p1-p2) 与矩形四条边的精确交点。
// 返回交点在线段上的比例 t (0 <= t <= 1)。
// 用于精确切断中轴线。
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
// 核心算法：使用矩形分割多边形 (轮廓)
// 流程：
// 1. 遍历多边形的所有顶点，判断它们是否在矩形外。
// 2. 如果点在矩形外，保留该点。
// 3. 当遇到从“外”到“内”或从“内”到“外”的跨越时，计算线段与矩形的交点。
// 4. 将这些交点添加进去，从而在矩形边界处形成一个平滑的“切口”。
// 5. 最终返回被切断后形成的多个独立的多边形。
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
// 核心算法：使用矩形分割折线 (中轴线)
// 流程：
// 1. 遍历中轴线的每一条线段。
// 2. 计算线段与矩形边界的交点 (tValues)。
// 3. 将线段按交点打碎成更小的子线段。
// 4. 检查每个子线段的中点是否在矩形内。
// 5. 如果在矩形外，则保留；如果在矩形内，则丢弃，从而实现“切断”效果。
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
