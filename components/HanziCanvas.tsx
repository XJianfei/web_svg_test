import React, { useEffect, useRef, useState } from 'react';
import { HanziData, AnimationConfig } from '../types';

interface HanziCanvasProps {
  data: HanziData;
  config: AnimationConfig;
  isPlaying: boolean;
  onAnimationEnd: () => void;
}

// Helper to get distance between points
const getDistance = (p1: number[], p2: number[]) => {
  const dx = p2[0] - p1[0];
  const dy = p2[1] - p1[1];
  return Math.sqrt(dx * dx + dy * dy);
};

// Helper to calculate total length of a polyline (median)
const getPolylineLength = (points: number[][]) => {
  let len = 0;
  for (let i = 0; i < points.length - 1; i++) {
    len += getDistance(points[i], points[i + 1]);
  }
  return len;
};

// Helper to get a point at a specific distance along the polyline
const getPointAtLength = (points: number[][], targetLen: number) => {
  let currentLen = 0;
  for (let i = 0; i < points.length - 1; i++) {
    const dist = getDistance(points[i], points[i + 1]);
    if (currentLen + dist >= targetLen) {
      const ratio = (targetLen - currentLen) / dist;
      const x = points[i][0] + (points[i + 1][0] - points[i][0]) * ratio;
      const y = points[i][1] + (points[i + 1][1] - points[i][1]) * ratio;
      return [x, y];
    }
    currentLen += dist;
  }
  return points[points.length - 1];
};

const HanziCanvas: React.FC<HanziCanvasProps> = ({ data, config, isPlaying, onAnimationEnd }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeStrokeIndex, setActiveStrokeIndex] = useState(-1);
  
  // Animation state
  const startTimeRef = useRef<number | null>(null);
  const reqIdRef = useRef<number | null>(null);
  
  // Canvas size constants
  const CANVAS_SIZE = 1024; // The data coordinate system is roughly 1024x1024
  const VIEW_SIZE = 400; // Display size in pixels

  // Draw background grid (Tian Zi Ge)
  const drawGrid = (ctx: CanvasRenderingContext2D) => {
    if (!config.showGrid) return;

    ctx.save();
    ctx.strokeStyle = '#e5e7eb'; // Gray-200
    ctx.lineWidth = 6;
    
    // Outer border
    ctx.beginPath();
    ctx.rect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    ctx.stroke();

    // Inner dotted lines
    ctx.lineWidth = 4;
    ctx.setLineDash([15, 15]);
    ctx.beginPath();
    // Vertical center
    ctx.moveTo(CANVAS_SIZE / 2, 0);
    ctx.lineTo(CANVAS_SIZE / 2, CANVAS_SIZE);
    // Horizontal center
    ctx.moveTo(0, CANVAS_SIZE / 2);
    ctx.lineTo(CANVAS_SIZE, CANVAS_SIZE / 2);
    // Diagonals
    ctx.moveTo(0, 0);
    ctx.lineTo(CANVAS_SIZE, CANVAS_SIZE);
    ctx.moveTo(CANVAS_SIZE, 0);
    ctx.lineTo(0, CANVAS_SIZE);
    
    ctx.stroke();
    ctx.restore();
  };

  const renderFrame = (timestamp: number) => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    if (!startTimeRef.current) startTimeRef.current = timestamp;
    const elapsed = timestamp - startTimeRef.current;
    
    // Clear canvas
    ctx.clearRect(0, 0, CANVAS_SIZE, CANVAS_SIZE);
    
    // Draw Grid
    drawGrid(ctx);
    
    // Save context before transforming for character rendering
    ctx.save();
    
    // TRANSFORMATION:
    // The data usually follows Cartesian coordinates (Y up), while Canvas is Y down.
    // The standard offset for this data format (e.g., MakeMeAHanzi) is usually 900.
    // We translate to the bottom and flip the Y axis.
    ctx.translate(0, 900);
    ctx.scale(1, -1);

    // Drawing Settings
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // LOGIC:
    // 1. If not playing, just draw everything based on config.
    // 2. If playing, determine which stroke is active based on time.
    
    // Calculate total duration of all strokes to map time -> stroke
    // We'll assign a duration per stroke based on its median length
    const STROKE_SPEED = 0.6 / config.speed; // Base ms per unit length, modulated by speed
    
    let cumulativeTime = 0;
    const strokeTimings = data.medians.map(median => {
      const length = getPolylineLength(median);
      const duration = length * STROKE_SPEED; 
      const start = cumulativeTime;
      cumulativeTime += duration;
      return { start, duration, length, end: cumulativeTime };
    });

    const totalDuration = cumulativeTime;
    
    // Handle Loop / Finish
    let currentAnimTime = elapsed;
    if (currentAnimTime > totalDuration) {
        if (config.loop) {
            startTimeRef.current = timestamp;
            currentAnimTime = 0;
        } else {
            currentAnimTime = totalDuration;
            if (isPlaying) onAnimationEnd(); // Trigger stop
        }
    }

    // Render Loop
    data.strokes.forEach((strokePathStr, index) => {
      const timing = strokeTimings[index];
      const path = new Path2D(strokePathStr);
      const median = data.medians[index];

      // Determine state of this stroke
      let progress = 0; // 0 to 1
      
      if (isPlaying) {
        if (currentAnimTime >= timing.end) {
          progress = 1;
        } else if (currentAnimTime >= timing.start) {
          progress = (currentAnimTime - timing.start) / timing.duration;
          setActiveStrokeIndex(index);
        } else {
          progress = 0;
        }
      } else {
        // Not playing = show full character
        progress = 1; 
        setActiveStrokeIndex(-1);
      }

      // DRAWING LOGIC
      
      // 1. Draw Outline (Ghost) if enabled and progress is 0
      if (config.showOutline && progress < 1) {
        ctx.save();
        ctx.fillStyle = '#e5e7eb'; // Very light gray
        ctx.fill(path);
        ctx.restore();
      }

      // 2. Draw Filled Stroke (Masked by median progress)
      if (progress > 0) {
        ctx.save();
        
        // CLIP to the shape of the stroke
        ctx.clip(path);

        // Draw a very thick line along the median up to progress
        const targetLen = timing.length * progress;
        
        ctx.beginPath();
        let currentLen = 0;
        if (median.length > 0) {
          ctx.moveTo(median[0][0], median[0][1]);
          for (let i = 0; i < median.length - 1; i++) {
            const segmentLen = getDistance(median[i], median[i+1]);
            if (currentLen + segmentLen > targetLen) {
              // Partial segment
              const [tx, ty] = getPointAtLength(median, targetLen);
              ctx.lineTo(tx, ty);
              break;
            } else {
              ctx.lineTo(median[i+1][0], median[i+1][1]);
              currentLen += segmentLen;
            }
          }
          // Check for last point if full
           if (progress >= 1) {
              ctx.lineTo(median[median.length-1][0], median[median.length-1][1]);
           }
        }
        
        // Stroke Style for the fill
        ctx.strokeStyle = '#1f2937'; // Dark gray / Black
        ctx.lineWidth = 140; // Large enough to cover the outline width
        ctx.stroke();
        
        ctx.restore();
      }

      // 3. Draw Median (Skeleton) if enabled
      if (config.showMedians) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = index === activeStrokeIndex ? '#ef4444' : '#3b82f6'; // Red if active, Blue otherwise
        ctx.lineWidth = 4;
        median.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt[0], pt[1]);
          else ctx.lineTo(pt[0], pt[1]);
        });
        ctx.stroke();
        
        // Draw points
        ctx.fillStyle = '#ef4444';
        median.forEach((pt) => {
            ctx.beginPath();
            ctx.arc(pt[0], pt[1], 6, 0, Math.PI * 2);
            ctx.fill();
        });

        ctx.restore();
      }

    });
    
    // Restore context to remove transform
    ctx.restore();
    
    if (isPlaying) {
        reqIdRef.current = requestAnimationFrame(renderFrame);
    }
  };

  // Reset animation time when play status changes to true
  useEffect(() => {
    if (isPlaying) {
      startTimeRef.current = null;
      reqIdRef.current = requestAnimationFrame(renderFrame);
    } else {
      // Trigger one render to show final state or static state
      reqIdRef.current = requestAnimationFrame(renderFrame);
    }
    
    return () => {
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isPlaying, config]); // Re-render if config changes

  // Initial Render
  useEffect(() => {
     reqIdRef.current = requestAnimationFrame(renderFrame);
     // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  return (
    <div className="relative bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{ width: '100%', maxWidth: `${VIEW_SIZE}px`, height: 'auto', display: 'block', margin: '0 auto' }}
        className="cursor-pointer"
        onClick={() => !isPlaying && (startTimeRef.current = null)}
      />
    </div>
  );
};

export default HanziCanvas;