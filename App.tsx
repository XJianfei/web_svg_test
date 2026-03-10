
import React, { useState } from 'react';
import HanziCanvas from './components/HanziCanvas';
import Controls from './components/Controls';
import KotlinCodeTab from './components/KotlinCodeTab';
import { CHARACTER_DATA } from './constants';
import { AnimationConfig, HanziData } from './types';
import { dist, flattenSVGPath, splitPolygonByRect, splitPolylineByRect, isPointInPolygon, getPolygonCentroid } from './utils';

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
  
  const [activeTab, setActiveTab] = useState<'app' | 'kotlin'>('app');

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
    const ERASER_SIZE_PIXELS = 20;
    const SCALE_FACTOR = 1024 / 400; // Approx 2.56
    const RECT_SIZE = ERASER_SIZE_PIXELS * SCALE_FACTOR * 1.5; // e.g. 76 units
    const rect = {
        x: x - RECT_SIZE / 2,
        y: y - RECT_SIZE / 2,
        w: RECT_SIZE,
        h: RECT_SIZE
    };

    const newStrokes: string[] = [];
    const newMedians: number[][][] = [];
    let hasChanged = false;

    // Iterate through existing strokes
    for (let i = 0; i < hanziData.strokes.length; i++) {
        const median = hanziData.medians[i];
        const pathStr = hanziData.strokes[i];

        // Check if click is near this stroke's median to save computation
        let minD = Number.MAX_VALUE;
        for(const pt of median) {
            const d = dist({x: pt[0], y: pt[1]}, {x, y});
            if (d < minD) minD = d;
        }

        // If close enough to possibly hit
        if (minD < 150 + RECT_SIZE) {
            // 1. Split Median
            const splitMedians = splitPolylineByRect(median, rect);
            
            // 2. Split Outline
            // Use lower sample rate (higher resolution) to capture small tips accurately
            const polyPoints = flattenSVGPath(pathStr, 2); 
            const splitOutlines = splitPolygonByRect(polyPoints, rect);

            if (splitOutlines.length === 0 && splitMedians.length === 0) {
                // Totally erased
                hasChanged = true;
                continue;
            }

            // If outlines exist, we MUST keep them.
            // The challenge is assigning a median to each outline.
            
            if (splitOutlines.length > 0) {
                const usedMedians = new Set<number>();
                
                // Prepare to populate new strokes
                hasChanged = true;

                splitOutlines.forEach((outlineObj) => {
                    // Strategy 1: Find a median that is "inside" this outline
                    let bestMedianIdx = -1;
                    let bestScore = -1; 

                    splitMedians.forEach((m, mIdx) => {
                        if (usedMedians.has(mIdx) && splitMedians.length >= splitOutlines.length) return; 
                        
                        let insideCount = 0;
                        for(const pt of m) {
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
                        // Found a good match
                        newStrokes.push(outlineObj.path);
                        newMedians.push(splitMedians[bestMedianIdx]);
                        usedMedians.add(bestMedianIdx);
                    } else {
                        // Strategy 2: If no median is strictly inside (e.g. mismatch or small tip),
                        // find the closest unused median centroid to the outline centroid.
                        const outlineCentroid = getPolygonCentroid(outlineObj.points);
                        
                        let closestIdx = -1;
                        let minDist = Number.MAX_VALUE;
                        
                        splitMedians.forEach((m, mIdx) => {
                             if (usedMedians.has(mIdx) && splitMedians.length >= splitOutlines.length) return;
                             
                             // Approx median centroid
                             const midPt = m[Math.floor(m.length/2)]; 
                             const d = dist({x: midPt[0], y: midPt[1]}, outlineCentroid);
                             if (d < minDist) {
                                 minDist = d;
                                 closestIdx = mIdx;
                             }
                        });

                        // Threshold for "closest" match - e.g. 100 units
                        if (closestIdx !== -1 && minDist < 100) {
                             newStrokes.push(outlineObj.path);
                             newMedians.push(splitMedians[closestIdx]);
                             usedMedians.add(closestIdx);
                        } else {
                             // Strategy 3: FALLBACK
                             // The outline exists, but the median was likely fully erased (e.g. a tip).
                             // We must create a dummy median so it renders.
                             // A tiny segment at the centroid.
                             const c = outlineCentroid;
                             const dummyMedian = [[c.x, c.y], [c.x+0.1, c.y+0.1]];
                             
                             newStrokes.push(outlineObj.path);
                             newMedians.push(dummyMedian);
                        }
                    }
                });
                
            } else {
                 // No outlines left? If medians exist, they are ghost medians. Discard.
                 hasChanged = true;
            }

        } else {
            // Too far, keep original
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
      <div className="text-center mb-8">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight font-serif" style={{ fontFamily: "'ZCOOL XiaoWei', serif" }}>
          Hanzi Zen
        </h1>
        <p className="mt-2 text-base text-gray-500 max-w-md mx-auto">
          Click on the character to cut the strokes with an eraser!
        </p>
      </div>

      {/* Tabs */}
      <div className="flex space-x-4 mb-8">
        <button
          onClick={() => setActiveTab('app')}
          className={`px-6 py-2 rounded-full font-medium transition-colors ${
            activeTab === 'app'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Interactive App
        </button>
        <button
          onClick={() => setActiveTab('kotlin')}
          className={`px-6 py-2 rounded-full font-medium transition-colors ${
            activeTab === 'kotlin'
              ? 'bg-blue-600 text-white shadow-md'
              : 'bg-gray-100 text-gray-600 hover:bg-gray-200'
          }`}
        >
          Kotlin Logic
        </button>
      </div>

      {/* Main Content Card */}
      {activeTab === 'app' ? (
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
      ) : (
        <div className="w-full max-w-4xl">
          <KotlinCodeTab />
        </div>
      )}

       <footer className="mt-16 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} Hanzi Zen. Visualization using SVG Paths & Canvas 2D.</p>
      </footer>

    </div>
  );
};

export default App;
