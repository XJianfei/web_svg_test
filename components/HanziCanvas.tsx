
import React, { useEffect, useRef, useState } from 'react';
import { HanziData, AnimationConfig } from '../types';

interface HanziCanvasProps {
  data: HanziData;
  config: AnimationConfig;
  isPlaying: boolean;
  onAnimationEnd: () => void;
  onCanvasClick?: (x: number, y: number) => void;
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

const HanziCanvas: React.FC<HanziCanvasProps> = ({ data, config, isPlaying, onAnimationEnd, onCanvasClick }) => {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [activeStrokeIndex, setActiveStrokeIndex] = useState(-1);
  const [mousePos, setMousePos] = useState<{x: number, y: number} | null>(null);
  
  // Animation state
  const startTimeRef = useRef<number | null>(null);
  const reqIdRef = useRef<number | null>(null);
  
  // Canvas size constants
  const CANVAS_SIZE = 1024; 
  const VIEW_SIZE = 400; 
  const DATA_Y_OFFSET = 900;

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
    ctx.translate(0, DATA_Y_OFFSET);
    ctx.scale(1, -1);

    // Drawing Settings
    ctx.lineCap = 'round';
    ctx.lineJoin = 'round';

    // Calculate total duration
    const STROKE_SPEED = 0.6 / config.speed;
    
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
            if (isPlaying) onAnimationEnd();
        }
    }

    // Render Loop
    data.strokes.forEach((strokePathStr, index) => {
      const timing = strokeTimings[index];
      const path = new Path2D(strokePathStr);
      const median = data.medians[index];

      let progress = 0;
      
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
        progress = 1; 
        setActiveStrokeIndex(-1);
      }

      // 1. Draw Outline (Ghost)
      if (config.showOutline && progress < 1) {
        ctx.save();
        ctx.fillStyle = '#e5e7eb';
        ctx.fill(path);
        ctx.restore();
      }

      // 2. Draw Filled Stroke
      if (progress > 0) {
        ctx.save();
        ctx.clip(path);
        const targetLen = timing.length * progress;
        ctx.beginPath();
        let currentLen = 0;
        if (median && median.length > 0) {
          ctx.moveTo(median[0][0], median[0][1]);
          for (let i = 0; i < median.length - 1; i++) {
            const segmentLen = getDistance(median[i], median[i+1]);
            if (currentLen + segmentLen > targetLen) {
              const [tx, ty] = getPointAtLength(median, targetLen);
              ctx.lineTo(tx, ty);
              break;
            } else {
              ctx.lineTo(median[i+1][0], median[i+1][1]);
              currentLen += segmentLen;
            }
          }
           if (progress >= 1 && median.length > 0) {
              ctx.lineTo(median[median.length-1][0], median[median.length-1][1]);
           }
        }
        ctx.strokeStyle = '#1f2937';
        ctx.lineWidth = 140;
        ctx.stroke();
        ctx.restore();
      }

      // 3. Draw Median
      if (config.showMedians && median) {
        ctx.save();
        ctx.beginPath();
        ctx.strokeStyle = index === activeStrokeIndex ? '#ef4444' : '#3b82f6';
        ctx.lineWidth = 4;
        median.forEach((pt, i) => {
          if (i === 0) ctx.moveTo(pt[0], pt[1]);
          else ctx.lineTo(pt[0], pt[1]);
        });
        ctx.stroke();
        ctx.fillStyle = '#ef4444';
        median.forEach((pt) => {
            ctx.beginPath();
            ctx.arc(pt[0], pt[1], 6, 0, Math.PI * 2);
            ctx.fill();
        });
        ctx.restore();
      }

    });
    
    // 4. Draw Eraser Rect
    if (mousePos && !isPlaying) {
        ctx.save();
        ctx.strokeStyle = 'rgba(239, 68, 68, 0.5)'; // red-500 with opacity
        ctx.lineWidth = 4;
        const ERASER_SIZE_PIXELS = config.eraserSize;
        const SCALE_FACTOR = 1024 / 400; // Approx 2.56
        const RECT_SIZE = ERASER_SIZE_PIXELS * SCALE_FACTOR * 1.5; // e.g. 76 units
        ctx.strokeRect(mousePos.x - RECT_SIZE/2, mousePos.y - RECT_SIZE/2, RECT_SIZE, RECT_SIZE);
        ctx.fillStyle = 'rgba(239, 68, 68, 0.1)';
        ctx.fillRect(mousePos.x - RECT_SIZE/2, mousePos.y - RECT_SIZE/2, RECT_SIZE, RECT_SIZE);
        ctx.restore();
    }

    ctx.restore();
    
    if (isPlaying) {
        reqIdRef.current = requestAnimationFrame(renderFrame);
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    
    const canvasX = clientX * scaleX;
    const canvasY = clientY * scaleY;

    const dataX = canvasX;
    const dataY = DATA_Y_OFFSET - canvasY;

    setMousePos({ x: dataX, y: dataY });
  };

  const handleMouseLeave = () => {
    setMousePos(null);
  };

  const handleClick = (e: React.MouseEvent<HTMLCanvasElement>) => {
    if (!onCanvasClick || !canvasRef.current) return;
    
    const rect = canvasRef.current.getBoundingClientRect();
    const clientX = e.clientX - rect.left;
    const clientY = e.clientY - rect.top;
    
    // Map client coordinates (0..clientWidth, 0..clientHeight) to (0..1024, 0..1024)
    // NOTE: internal canvas width is 1024.
    const scaleX = CANVAS_SIZE / rect.width;
    const scaleY = CANVAS_SIZE / rect.height;
    
    const canvasX = clientX * scaleX;
    const canvasY = clientY * scaleY;

    // Map to Data Coordinate Space (flipped Y, translated)
    // Transform was: translate(0, 900), scale(1, -1)
    // y_canvas = 900 - y_data * 1  => y_data = 900 - y_canvas
    const dataX = canvasX;
    const dataY = DATA_Y_OFFSET - canvasY;

    onCanvasClick(dataX, dataY);
  };

  useEffect(() => {
    if (isPlaying) {
      startTimeRef.current = null;
      reqIdRef.current = requestAnimationFrame(renderFrame);
    } else {
      reqIdRef.current = requestAnimationFrame(renderFrame);
    }
    return () => {
      if (reqIdRef.current) cancelAnimationFrame(reqIdRef.current);
    };
  }, [isPlaying, config, data]);

  useEffect(() => {
     reqIdRef.current = requestAnimationFrame(renderFrame);
  }, []);

  return (
    <div className="relative bg-white rounded-xl shadow-lg overflow-hidden border border-gray-100">
      <canvas
        ref={canvasRef}
        width={CANVAS_SIZE}
        height={CANVAS_SIZE}
        style={{ width: '100%', maxWidth: `${VIEW_SIZE}px`, height: 'auto', display: 'block', margin: '0 auto' }}
        className="cursor-crosshair active:cursor-none"
        onClick={handleClick}
        onMouseMove={handleMouseMove}
        onMouseLeave={handleMouseLeave}
      />
    </div>
  );
};

export default HanziCanvas;
