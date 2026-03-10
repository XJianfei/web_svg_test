import React from 'react';

const kotlinCode = `
data class Point(val x: Double, val y: Double)

data class Rect(val x: Double, val y: Double, val w: Double, val h: Double)

data class Outline(val path: String, val points: List<Point>)

data class HanziData(
    val character: String,
    val strokes: List<String>, // SVG Path 字符串
    val medians: List<List<Point>> // 每个笔画的中轴线点集
)

// --- 基础几何工具 ---

fun isPointInRect(p: Point, rect: Rect): Boolean {
    return p.x >= rect.x && p.x <= rect.x + rect.w && p.y >= rect.y && p.y <= rect.y + rect.h
}

fun dist(p1: Point, p2: Point): Double {
    return Math.hypot(p1.x - p2.x, p1.y - p2.y)
}

fun lerp(p1: Point, p2: Point, t: Double): Point {
    return Point(
        x = p1.x + (p2.x - p1.x) * t,
        y = p1.y + (p2.y - p1.y) * t
    )
}

// 射线法判断点是否在多边形内
fun isPointInPolygon(p: Point, polygon: List<Point>): Boolean {
    var inside = false
    var j = polygon.size - 1
    for (i in polygon.indices) {
        val xi = polygon[i].x
        val yi = polygon[i].y
        val xj = polygon[j].x
        val yj = polygon[j].y
        
        val intersect = ((yi > p.y) != (yj > p.y)) && (p.x < (xj - xi) * (p.y - yi) / (yj - yi) + xi)
        if (intersect) inside = !inside
        j = i
    }
    return inside
}

// 获取多边形质心
fun getPolygonCentroid(points: List<Point>): Point {
    if (points.isEmpty()) return Point(0.0, 0.0)
    var x = 0.0
    var y = 0.0
    for (p in points) {
        x += p.x
        y += p.y
    }
    return Point(x / points.size, y / points.size)
}

// 将点集转换为 SVG Path 字符串
fun pointsToPath(points: List<Point>): String {
    if (points.isEmpty()) return ""
    val sb = StringBuilder()
    for (i in points.indices) {
        val p = points[i]
        if (i == 0) sb.append("M ") else sb.append("L ")
        // 格式化保留一位小数
        sb.append(String.format("%.1f %.1f", p.x, p.y))
        sb.append(" ")
    }
    sb.append("Z")
    return sb.toString()
}

// 将 SVG Path 展平为点集 (解析 M, L, Q, C, Z 指令)
fun flattenSVGPath(pathStr: String, sampleRate: Double = 2.0): List<Point> {
    val points = mutableListOf<Point>()
    // 匹配字母及其后面的非字母字符 (如 "M 10 20", "L30,40")
    val regex = Regex("[a-zA-Z][^a-zA-Z]*")
    val commands = regex.findAll(pathStr).map { it.value.trim() }.toList()
    
    if (commands.isEmpty()) return emptyList()

    var currentPoint = Point(0.0, 0.0)
    var startPoint = Point(0.0, 0.0)

    for (cmd in commands) {
        if (cmd.isEmpty()) continue
        val type = cmd[0]
        
        // 处理参数：将负号前加空格以防连写 (如 "10-20" -> "10 -20")，然后按空格或逗号分割
        val argsStr = cmd.substring(1).replace("-", " -").trim()
        val args = argsStr.split(Regex("[\\\\s,]+")).mapNotNull { it.toDoubleOrNull() }

        when (type) {
            'M', 'm' -> {
                if (args.size >= 2) {
                    // 简化处理：这里统一按绝对坐标处理 (实际 SVG 中 m 是相对坐标)
                    // 汉字库通常使用绝对坐标 M
                    currentPoint = Point(args[0], args[1])
                    startPoint = currentPoint
                    points.add(currentPoint)
                }
            }
            'L', 'l' -> {
                if (args.size >= 2) {
                    val target = Point(args[0], args[1])
                    val d = dist(currentPoint, target)
                    val steps = Math.max(1, Math.ceil(d / sampleRate).toInt())
                    for (i in 1..steps) {
                        val t = i.toDouble() / steps
                        points.add(lerp(currentPoint, target, t))
                    }
                    currentPoint = target
                }
            }
            'Q', 'q' -> {
                if (args.size >= 4) {
                    val cp = Point(args[0], args[1])
                    val target = Point(args[2], args[3])
                    
                    // 估算二次贝塞尔曲线长度
                    val approxLen = dist(currentPoint, cp) + dist(cp, target)
                    val steps = Math.max(1, Math.ceil(approxLen / sampleRate).toInt())
                    
                    for (i in 1..steps) {
                        val t = i.toDouble() / steps
                        val invT = 1.0 - t
                        val x = invT * invT * currentPoint.x + 2 * invT * t * cp.x + t * t * target.x
                        val y = invT * invT * currentPoint.y + 2 * invT * t * cp.y + t * t * target.y
                        points.add(Point(x, y))
                    }
                    currentPoint = target
                }
            }
            'C', 'c' -> {
                if (args.size >= 6) {
                    val cp1 = Point(args[0], args[1])
                    val cp2 = Point(args[2], args[3])
                    val target = Point(args[4], args[5])
                    
                    // 估算三次贝塞尔曲线长度
                    val approxLen = dist(currentPoint, cp1) + dist(cp1, cp2) + dist(cp2, target)
                    val steps = Math.max(1, Math.ceil(approxLen / sampleRate).toInt())
                    
                    for (i in 1..steps) {
                        val t = i.toDouble() / steps
                        val invT = 1.0 - t
                        val x = invT * invT * invT * currentPoint.x + 
                                3 * invT * invT * t * cp1.x + 
                                3 * invT * t * t * cp2.x + 
                                t * t * t * target.x
                        val y = invT * invT * invT * currentPoint.y + 
                                3 * invT * invT * t * cp1.y + 
                                3 * invT * t * t * cp2.y + 
                                t * t * t * target.y
                        points.add(Point(x, y))
                    }
                    currentPoint = target
                }
            }
            'Z', 'z' -> {
                val d = dist(currentPoint, startPoint)
                if (d > 0) {
                    val steps = Math.max(1, Math.ceil(d / sampleRate).toInt())
                    for (i in 1..steps) {
                        val t = i.toDouble() / steps
                        points.add(lerp(currentPoint, startPoint, t))
                    }
                }
                currentPoint = startPoint
            }
        }
    }
    return points
}

// --- 核心分割算法 ---

// 查找线段与边界的交点 (二分查找变体 - 用于多边形)
fun getIntersectionBinary(p1: Point, p2: Point, isInside: (Point) -> Boolean): Point {
    val d = dist(p1, p2)
    if (d == 0.0) return p1
    val vx = (p2.x - p1.x) / d
    val vy = (p2.y - p1.y) / d
    
    var start = 0.0
    var end = d
    val p1Inside = isInside(p1)

    // 二分查找提高精度
    for (i in 0 until 12) {
        val mid = (start + end) / 2.0
        val testPt = Point(p1.x + vx * mid, p1.y + vy * mid)
        if (isInside(testPt)) {
            if (p1Inside) start = mid else end = mid
        } else {
            if (p1Inside) end = mid else start = mid
        }
    }
    val finalMid = (start + end) / 2.0
    return Point(p1.x + vx * finalMid, p1.y + vy * finalMid)
}

// 解析几何计算线段 (p1-p2) 与矩形的交点
// 返回交点在线段上的比例 t (0 <= t <= 1)
fun getSegmentRectIntersections(p1: Point, p2: Point, rect: Rect): List<Double> {
    val tValues = mutableListOf<Double>()
    val dx = p2.x - p1.x
    val dy = p2.y - p1.y
    
    fun checkEdge(nx: Double, ny: Double, d: Double, isX: Boolean) {
        val denom = nx * dx + ny * dy
        if (Math.abs(denom) > 1e-6) {
            val t = (d - nx * p1.x - ny * p1.y) / denom
            if (t > 1e-5 && t < 1.0 - 1e-5) {
                val pt = Point(p1.x + t * dx, p1.y + t * dy)
                if (isX) {
                    if (pt.y >= rect.y - 1e-5 && pt.y <= rect.y + rect.h + 1e-5) tValues.add(t)
                } else {
                    if (pt.x >= rect.x - 1e-5 && pt.x <= rect.x + rect.w + 1e-5) tValues.add(t)
                }
            }
        }
    }
    
    checkEdge(1.0, 0.0, rect.x, true) // 左边缘
    checkEdge(1.0, 0.0, rect.x + rect.w, true) // 右边缘
    checkEdge(0.0, 1.0, rect.y, false) // 上边缘
    checkEdge(0.0, 1.0, rect.y + rect.h, false) // 下边缘
    
    return tValues.sorted().filterIndexed { index, t -> 
        index == 0 || t - tValues[index - 1] > 1e-5 
    }
}

// 使用矩形分割多边形 (轮廓)
// 返回被分割后的多个多边形点集
fun splitPolygonByRect(points: List<Point>, rect: Rect): List<Outline> {
    if (points.size < 3) return emptyList()

    val isOut = { p: Point -> !isPointInRect(p, rect) }
    val status = points.map(isOut)

    // 如果全部在矩形外，保留原多边形
    if (status.all { it }) return listOf(Outline(pointsToPath(points), points))
    // 如果全部在矩形内，完全擦除
    if (status.all { !it }) return emptyList()

    val segments = mutableListOf<List<Point>>()
    var currentSegment = mutableListOf<Point>()
    
    // 找到第一个从内到外的转换点作为起点，以正确处理闭合多边形的环绕
    var startIndex = 0
    for (i in points.indices) {
        val prevIdx = (i - 1 + points.size) % points.size
        if (!status[prevIdx] && status[i]) {
            startIndex = i
            break
        }
    }

    val orderedPoints = mutableListOf<Point>()
    for (i in points.indices) {
        orderedPoints.add(points[(startIndex + i) % points.size])
    }
    val orderedStatus = orderedPoints.map(isOut)

    for (i in orderedPoints.indices) {
        val p = orderedPoints[i]
        val out = orderedStatus[i]

        if (out) {
            if (currentSegment.isEmpty()) {
                // 新线段的起点，计算与矩形的交点
                val prevIdx = (i - 1 + orderedPoints.size) % orderedPoints.size
                val prev = orderedPoints[prevIdx]
                val intersect = getIntersectionBinary(prev, p) { pt -> isPointInRect(pt, rect) }
                currentSegment.add(intersect)
            }
            currentSegment.add(p)
        } else {
            if (currentSegment.isNotEmpty()) {
                // 线段的终点，计算与矩形的交点
                val prev = orderedPoints[i - 1]
                val intersect = getIntersectionBinary(prev, p) { pt -> isPointInRect(pt, rect) }
                currentSegment.add(intersect)
                segments.add(currentSegment)
                currentSegment = mutableListOf()
            }
        }
    }
    
    if (currentSegment.isNotEmpty()) {
         segments.add(currentSegment)
    }

    return segments.map { Outline(pointsToPath(it), it) }
}

// 使用矩形分割折线 (中轴线)
// 返回被分割后的多条折线
fun splitPolylineByRect(median: List<Point>, rect: Rect): List<List<Point>> {
    val segments = mutableListOf<List<Point>>()
    var currentSegment = mutableListOf<Point>()

    for (i in 0 until median.size - 1) {
        val p1 = median[i]
        val p2 = median[i + 1]
        
        // 获取当前线段与矩形的所有交点
        val tValues = getSegmentRectIntersections(p1, p2, rect)
        val checkPoints = listOf(0.0) + tValues + listOf(1.0)
        
        // 遍历被交点分割出的小线段
        for (k in 0 until checkPoints.size - 1) {
            val tStart = checkPoints[k]
            val tEnd = checkPoints[k + 1]
            
            val startPt = lerp(p1, p2, tStart)
            val endPt = lerp(p1, p2, tEnd)
            val midPt = lerp(p1, p2, (tStart + tEnd) / 2.0)
            
            val isInside = isPointInRect(midPt, rect)
            
            if (!isInside) {
                // 在矩形外，保留
                if (currentSegment.isEmpty()) {
                    currentSegment.add(startPt)
                } else {
                    val last = currentSegment.last()
                    // 避免重复添加非常接近的点
                    if (dist(last, startPt) > 0.1) {
                        currentSegment.add(startPt)
                    }
                }
                currentSegment.add(endPt)
            } else {
                // 在矩形内，切断
                if (currentSegment.isNotEmpty()) {
                    // 忽略过短的无效线段
                    if (currentSegment.size > 1 || (currentSegment.size == 2 && dist(currentSegment[0], currentSegment[1]) > 0.1)) {
                         segments.add(currentSegment)
                    }
                    currentSegment = mutableListOf()
                }
            }
        }
    }
    
    if (currentSegment.isNotEmpty()) {
         if (currentSegment.size > 1 || (currentSegment.size == 2 && dist(currentSegment[0], currentSegment[1]) > 0.1)) {
             segments.add(currentSegment)
         }
    }
    
    return segments
}

// --- 顶层擦除逻辑 ---

/**
 * 在指定位置使用矩形橡皮擦擦除汉字笔画。
 * @param hanziData 当前汉字的数据 (包含轮廓和中轴线)
 * @param rect 橡皮擦的矩形区域
 * @return 擦除后的新汉字数据
 */
fun eraseAt(hanziData: HanziData, rect: Rect): HanziData {
    val newStrokes = mutableListOf<String>()
    val newMedians = mutableListOf<List<Point>>()
    var hasChanged = false

    // 遍历所有现有的笔画
    for (i in hanziData.strokes.indices) {
        val median = hanziData.medians[i]
        val pathStr = hanziData.strokes[i]

        // 优化：先检查中轴线是否在橡皮擦附近
        var minD = Double.MAX_VALUE
        val rectCenter = Point(rect.x + rect.w / 2, rect.y + rect.h / 2)
        for (pt in median) {
            val d = dist(pt, rectCenter)
            if (d < minD) minD = d
        }

        // 如果距离足够近，可能发生碰撞 (150 是一个经验阈值，表示笔画的最大粗细)
        if (minD < 150 + Math.max(rect.w, rect.h)) {
            // 1. 分割中轴线
            val splitMedians = splitPolylineByRect(median, rect)
            
            // 2. 分割轮廓
            // 注意：flattenSVGPath 需要您自己实现或使用平台 API
            val polyPoints = flattenSVGPath(pathStr, 2.0) 
            val splitOutlines = splitPolygonByRect(polyPoints, rect)

            // 如果都被完全擦除
            if (splitOutlines.isEmpty() && splitMedians.isEmpty()) {
                hasChanged = true
                continue
            }

            // 如果还有剩余的轮廓，我们需要将新的轮廓与新的中轴线重新匹配
            if (splitOutlines.isNotEmpty()) {
                val usedMedians = mutableSetOf<Int>()
                hasChanged = true

                for (outlineObj in splitOutlines) {
                    var bestMedianIdx = -1
                    var bestScore = -1 

                    // 策略 1: 寻找一个"在轮廓内部"点数最多的中轴线
                    for ((mIdx, m) in splitMedians.withIndex()) {
                        if (usedMedians.contains(mIdx) && splitMedians.size >= splitOutlines.size) continue 
                        
                        var insideCount = 0
                        for (pt in m) {
                            if (isPointInPolygon(pt, outlineObj.points)) {
                                insideCount++
                            }
                        }
                        
                        if (insideCount > bestScore) {
                            bestScore = insideCount
                            bestMedianIdx = mIdx
                        }
                    }

                    if (bestMedianIdx != -1 && bestScore > 0) {
                        // 找到了匹配的中轴线
                        newStrokes.add(outlineObj.path)
                        newMedians.add(splitMedians[bestMedianIdx])
                        usedMedians.add(bestMedianIdx)
                    } else {
                        // 策略 2: 如果没有中轴线严格在内部，寻找质心最近的中轴线
                        val outlineCentroid = getPolygonCentroid(outlineObj.points)
                        
                        var closestIdx = -1
                        var minDist = Double.MAX_VALUE
                        
                        for ((mIdx, m) in splitMedians.withIndex()) {
                             if (usedMedians.contains(mIdx) && splitMedians.size >= splitOutlines.size) continue
                             
                             // 取中轴线的中间点作为近似质心
                             val midPt = m[m.size / 2] 
                             val d = dist(midPt, outlineCentroid)
                             if (d < minDist) {
                                 minDist = d
                                 closestIdx = mIdx
                             }
                        }

                        // 阈值判断 (例如 100 单位)
                        if (closestIdx != -1 && minDist < 100.0) {
                             newStrokes.add(outlineObj.path)
                             newMedians.add(splitMedians[closestIdx])
                             usedMedians.add(closestIdx)
                        } else {
                             // 策略 3: 兜底方案
                             // 轮廓存在，但中轴线可能被完全擦除了 (例如笔画的极小尖端)
                             // 创建一个微小的虚拟中轴线，确保它可以被渲染
                             val c = outlineCentroid
                             val dummyMedian = listOf(
                                 Point(c.x, c.y), 
                                 Point(c.x + 0.1, c.y + 0.1)
                             )
                             
                             newStrokes.add(outlineObj.path)
                             newMedians.add(dummyMedian)
                        }
                    }
                }
            } else {
                 // 没有轮廓剩下，只有幽灵中轴线，直接丢弃
                 hasChanged = true
            }
        } else {
            // 距离太远，保留原样
            newStrokes.add(pathStr)
            newMedians.add(median)
        }
    }

    return if (hasChanged) {
        HanziData(hanziData.character, newStrokes, newMedians)
    } else {
        hanziData
    }
}
`;

const KotlinCodeTab: React.FC = () => {
  return (
    <div className="w-full max-w-4xl mx-auto bg-[#1e1e1e] rounded-xl shadow-lg overflow-hidden border border-gray-800">
      <div className="flex items-center justify-between px-4 py-3 bg-[#2d2d2d] border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <span className="text-sm font-mono text-gray-400">EraserLogic.kt</span>
        <div className="w-16"></div> {/* Spacer for centering */}
      </div>
      <div className="p-6 overflow-x-auto">
        <pre className="text-sm font-mono text-gray-300 leading-relaxed">
          <code>{kotlinCode}</code>
        </pre>
      </div>
    </div>
  );
};

export default KotlinCodeTab;
