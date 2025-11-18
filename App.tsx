
import React, { useState } from 'react';
import HanziCanvas from './components/HanziCanvas';
import Controls from './components/Controls';
import { CHARACTER_DATA } from './constants';
import { AnimationConfig, HanziData } from './types';
import { dist, flattenSVGPath, splitPolygon, splitPolyline, isPointInPolygon } from './utils';

const App: React.FC = () => {
  // Initialize state with constant data
  const [hanziData, setHanziData] = useState<HanziData>(CHARACTER_DATA);
  
  const [isPlaying, setIsPlaying] = useState(true);
  const [config, setConfig] = useState<AnimationConfig>({
    speed: 1,
    loop: true,
    showMedians: false,
    showGrid: true,
    showOutline: true,
  });

  const handleAnimationEnd = () => {
    if (!config.loop) {
      setIsPlaying(false);
    }
  };

  const handleTogglePlay = () => {
    setIsPlaying(!isPlaying);
  };

  const handleReset = () => {
    setHanziData(CHARACTER_DATA); // Reset to original
    setIsPlaying(false);
    setTimeout(() => setIsPlaying(true), 10);
  };

  // Eraser Logic
  const handleCanvasClick = (x: number, y: number) => {
    // Eraser parameters
    const ERASER_RADIUS_PIXELS = 10;
    const SCALE_FACTOR = 1024 / 400; // Approx 2.56
    const RADIUS = ERASER_RADIUS_PIXELS * SCALE_FACTOR * 1.5; // Slightly larger for effective cutting (approx 38 units)

    const newStrokes: string[] = [];
    const newMedians: number[][][] = [];
    let hasChanged = false;

    // Iterate through existing strokes
    for (let i = 0; i < hanziData.strokes.length; i++) {
        const median = hanziData.medians[i];
        const pathStr = hanziData.strokes[i];

        // Check if click is near this stroke's median to save computation
        // Calculate min distance to median
        let minD = Number.MAX_VALUE;
        for(const pt of median) {
            const d = dist({x: pt[0], y: pt[1]}, {x, y});
            if (d < minD) minD = d;
        }

        // If close enough to possibly hit
        if (minD < 150 + RADIUS) {
            // 1. Split Median
            const splitMedians = splitPolyline(median, x, y, RADIUS);
            
            // 2. Split Outline
            const polyPoints = flattenSVGPath(pathStr, 8); // Higher sampling for better accuracy
            const splitOutlines = splitPolygon(polyPoints, x, y, RADIUS);

            // Pairing Logic
            // We need to map each new outline to a new median.
            
            if (splitOutlines.length === 0 && splitMedians.length === 0) {
                // Totally erased
                hasChanged = true;
                continue;
            }

            if (splitOutlines.length === 1 && splitMedians.length === 1) {
                // Simple modification (bite taken out, or end shortened)
                // Check if it actually changed
                const oldLen = getPolylineLength(median);
                const newLen = getPolylineLength(splitMedians[0]);
                // If length changed significantly or splitPolygon implies a change (it returns new path)
                if (Math.abs(oldLen - newLen) > 1 || splitOutlines[0].path !== pathStr) {
                     newStrokes.push(splitOutlines[0].path);
                     newMedians.push(splitMedians[0]);
                     hasChanged = true;
                } else {
                     newStrokes.push(pathStr);
                     newMedians.push(median);
                }
                continue;
            }

            // Complex split (1 -> Many or mismatch)
            if (splitOutlines.length > 0) {
                 // We try to find a matching median for each outline
                 // If multiple outlines, we look for medians inside them
                 
                 const usedMedians = new Set<number>();
                 
                 splitOutlines.forEach((outlineObj) => {
                     // Find best median
                     let bestMedianIdx = -1;
                     let bestScore = -1; // Number of points inside

                     splitMedians.forEach((m, mIdx) => {
                         if (usedMedians.has(mIdx) && splitMedians.length > splitOutlines.length) return; 
                         
                         // Check how many points of median are inside this outline
                         let insideCount = 0;
                         // Check a few sample points
                         const samples = [m[0], m[Math.floor(m.length/2)], m[m.length-1]];
                         for(const pt of samples) {
                             if (isPointInPolygon({x: pt[0], y: pt[1]}, outlineObj.points)) {
                                 insideCount++;
                             }
                         }
                         
                         if (insideCount > bestScore) {
                             bestScore = insideCount;
                             bestMedianIdx = mIdx;
                         }
                     });

                     if (bestMedianIdx !== -1 && bestScore > 0) {
                         newStrokes.push(outlineObj.path);
                         newMedians.push(splitMedians[bestMedianIdx]);
                         usedMedians.add(bestMedianIdx);
                         hasChanged = true;
                     } else {
                         // Outline exists but no median found inside it.
                         // This happens if the median was erased but outline remains (hollow stroke?)
                         // Or if the outline is a tiny sliver.
                         // If outline is decent size, we might want to keep it with a dummy median?
                         // For now, we skip it to avoid crashes, but this is where "disappearing" happens.
                         
                         // Fallback: If 1 outline and 1 median total, just take it
                         if (splitOutlines.length === 1 && splitMedians.length === 1) {
                             newStrokes.push(outlineObj.path);
                             newMedians.push(splitMedians[0]);
                             hasChanged = true;
                         }
                     }
                 });
            } else {
                // Outline disappeared but median remains? Unlikely with logic, but remove stroke
                hasChanged = true;
            }

        } else {
            // Too far
            newStrokes.push(pathStr);
            newMedians.push(median);
        }
    }

    if (hasChanged) {
        setHanziData({
            ...hanziData,
            strokes: newStrokes,
            medians: newMedians
        });
        setIsPlaying(false);
    }
  };

  // Helper needed in this scope for logic above
  const getPolylineLength = (points: number[][]) => {
    let len = 0;
    for (let i = 0; i < points.length - 1; i++) {
      const dx = points[i+1][0] - points[i][0];
      const dy = points[i+1][1] - points[i][1];
      len += Math.sqrt(dx*dx + dy*dy);
    }
    return len;
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight font-serif" style={{ fontFamily: "'ZCOOL XiaoWei', serif" }}>
          Hanzi Zen
        </h1>
        <p className="mt-2 text-base text-gray-500 max-w-md mx-auto">
          Click on the character to cut the strokes with an eraser!
        </p>
      </div>

      {/* Main Content Card */}
      <div className="w-full max-w-3xl flex flex-col md:flex-row gap-8 items-start justify-center">
        
        {/* Left: Canvas */}
        <div className="w-full md:w-auto flex-shrink-0 flex justify-center">
            <div className="relative group">
                <HanziCanvas 
                    data={hanziData} 
                    config={config} 
                    isPlaying={isPlaying}
                    onAnimationEnd={handleAnimationEnd}
                    onCanvasClick={handleCanvasClick}
                />
                 {/* Decorative shadow/glow behind canvas */}
                 <div className="absolute -inset-4 bg-gradient-to-br from-blue-50 to-amber-50 rounded-3xl -z-10 opacity-70 blur-lg group-hover:opacity-100 transition-opacity duration-700"></div>
            </div>
        </div>

        {/* Right: Details & Controls */}
        <div className="w-full flex flex-col">
             {/* Character Info */}
             <div className="bg-white p-6 rounded-xl shadow-sm border border-gray-100 mb-6">
                <div className="flex items-baseline justify-between border-b border-gray-100 pb-4 mb-4">
                    <h2 className="text-6xl font-bold text-gray-800 font-serif">{hanziData.character}</h2>
                    <div className="text-right">
                        <span className="block text-sm font-semibold text-gray-400 uppercase tracking-wide">Pinyin</span>
                        <span className="text-2xl font-medium text-gray-700">jǔ</span>
                    </div>
                </div>
                <div className="space-y-2">
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Meaning</span>
                        <span className="font-medium text-gray-800">To lift / To raise / To act</span>
                    </div>
                    <div className="flex justify-between text-sm">
                        <span className="text-gray-500">Strokes</span>
                        <span className="font-medium text-gray-800">{hanziData.strokes.length}</span>
                    </div>
                    <div className="mt-4 p-3 bg-yellow-50 text-yellow-800 text-xs rounded-md">
                        Tip: Click on a stroke to cut it into two separate strokes.
                    </div>
                </div>
             </div>

             {/* Controls */}
             <Controls 
                isPlaying={isPlaying} 
                onTogglePlay={handleTogglePlay} 
                onReset={handleReset}
                config={config}
                setConfig={setConfig}
             />
        </div>

      </div>

       <footer className="mt-16 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} Hanzi Zen. Visualization using SVG Paths & Canvas 2D.</p>
      </footer>

    </div>
  );
};

export default App;
