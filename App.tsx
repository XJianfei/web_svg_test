
import React, { useState } from 'react';
import HanziCanvas from './components/HanziCanvas';
import Controls from './components/Controls';
import KotlinCodeTab from './components/KotlinCodeTab';
import { CHARACTER_DATA } from './constants';
import { AnimationConfig, HanziData } from './types';
import { dist, flattenSVGPath, splitPolygonByRectRobust, splitPolylineByRect, isPointInPolygon, getPolygonCentroid, isPointInRect } from './utils';

const App: React.FC = () => {
  // Initialize state with constant data
  const [hanziData, setHanziData] = useState<HanziData>(CHARACTER_DATA);
  const [history, setHistory] = useState<HanziData[]>([CHARACTER_DATA]);
  const [historyIndex, setHistoryIndex] = useState(0);
  
  const [isPlaying, setIsPlaying] = useState(false);
  const [config, setConfig] = useState<AnimationConfig>({
    speed: 1,
    loop: true,
    showMedians: false,
    showGrid: true,
    showOutline: true,
    eraserSize: 20,
  });
  
  const [activeTab, setActiveTab] = useState<'app' | 'kotlin'>('app');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoading, setIsLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const fetchCharacterData = async (char: string) => {
    setIsLoading(true);
    setError(null);
    try {
      const response = await fetch(`https://cdn.jsdelivr.net/npm/hanzi-writer-data@2.0.1/${char}.json`);
      if (!response.ok) throw new Error('Character not found');
      const data = await response.json();
      
      // Transform data to our format
      const newData: HanziData = {
        character: char,
        strokes: data.strokes,
        medians: data.medians
      };
      
      setHanziData(newData);
      setHistory([newData]);
      setHistoryIndex(0);
      setIsPlaying(false);
      setTimeout(() => setIsPlaying(true), 10);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load character');
    } finally {
      setIsLoading(false);
    }
  };

  const handleSearch = (e: React.FormEvent) => {
    e.preventDefault();
    if (searchTerm.trim()) {
      fetchCharacterData(searchTerm.trim()[0]);
    }
  };

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
    setHistory([CHARACTER_DATA]);
    setHistoryIndex(0);
    setIsPlaying(false);
    setTimeout(() => setIsPlaying(true), 10);
  };

  const handleUndo = () => {
    if (historyIndex > 0) {
      const prevIndex = historyIndex - 1;
      setHistoryIndex(prevIndex);
      setHanziData(history[prevIndex]);
      setIsPlaying(false);
    }
  };

  const handleClear = () => {
    const emptyData = { ...hanziData, strokes: [], medians: [] };
    const newHistory = history.slice(0, historyIndex + 1);
    newHistory.push(emptyData);
    setHistory(newHistory);
    setHistoryIndex(newHistory.length - 1);
    setHanziData(emptyData);
    setIsPlaying(false);
  };

  // Eraser Logic
  const handleCanvasClick = (x: number, y: number) => {
    // Eraser parameters
    const ERASER_SIZE_PIXELS = config.eraserSize;
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

    // Group strokes by outline path to prevent exponential duplication
    const uniqueOutlines = new Map<string, number[][][]>();
    for (let i = 0; i < hanziData.strokes.length; i++) {
        const pathStr = hanziData.strokes[i];
        const median = hanziData.medians[i];
        if (!uniqueOutlines.has(pathStr)) {
            uniqueOutlines.set(pathStr, []);
        }
        uniqueOutlines.get(pathStr)!.push(median);
    }

    // Iterate through unique outlines
    for (const [pathStr, medians] of uniqueOutlines.entries()) {
        // Check if click is near ANY of this outline's medians to save computation
        let minD = Number.MAX_VALUE;
        for (const median of medians) {
            for(const pt of median) {
                const d = dist({x: pt[0], y: pt[1]}, {x, y});
                if (d < minD) minD = d;
            }
        }

        // If close enough to possibly hit
        if (minD < 150 + RECT_SIZE) {
            // 1. Split ALL Medians
            const allSplitMedians: number[][][] = [];
            let mediansChanged = false;
            for (const median of medians) {
                const splitMedians = splitPolylineByRect(median, rect);
                if (splitMedians.length !== 1 || splitMedians[0].length !== median.length) {
                    mediansChanged = true;
                }
                allSplitMedians.push(...splitMedians);
            }
            
            // 2. Split Outline
            // Use lower sample rate (higher resolution) to capture small tips accurately
            const polyPoints = flattenSVGPath(pathStr, 2); 
            const splitOutlines = splitPolygonByRectRobust(polyPoints, rect);

            let outlineChanged = false;
            if (splitOutlines.length !== 1) {
                outlineChanged = true;
            } else {
                const originalPointsCount = polyPoints.reduce((sum, ring) => sum + ring.length, 0);
                if (splitOutlines[0].ringCount !== polyPoints.length) {
                    outlineChanged = true;
                } else if (Math.abs(splitOutlines[0].totalPoints - originalPointsCount) > 5) {
                    outlineChanged = true;
                } else {
                    // Check if any point of polyPoints is inside rect
                    let intersects = false;
                    for (const ring of polyPoints) {
                        for (const pt of ring) {
                            if (isPointInRect(pt, rect)) {
                                intersects = true;
                                break;
                            }
                        }
                        if (intersects) break;
                    }
                    if (intersects) outlineChanged = true;
                }
            }

            if (!mediansChanged && !outlineChanged) {
                // Nothing was actually erased
                medians.forEach(m => {
                    newStrokes.push(pathStr);
                    newMedians.push(m);
                });
                continue;
            }

            if (splitOutlines.length === 0 && allSplitMedians.length === 0) {
                // Totally erased
                hasChanged = true;
                continue;
            }

            // If outlines exist, we MUST keep them.
            // The challenge is assigning a median to each outline.
            
            if (splitOutlines.length > 0) {
                hasChanged = true;
                
                // 1. Map each median to its best outline
                const medianToOutline = new Map<number, number>();
                allSplitMedians.forEach((m, mIdx) => {
                    let bestOutlineIdx = -1;
                    let bestScore = -1;
                    
                    splitOutlines.forEach((outlineObj, oIdx) => {
                        let insideCount = 0;
                        for(const pt of m) {
                            if (isPointInPolygon({x: pt[0], y: pt[1]}, outlineObj.points)) {
                                insideCount++;
                            }
                        }
                        if (insideCount > bestScore) {
                            bestScore = insideCount;
                            bestOutlineIdx = oIdx;
                        }
                    });
                    
                    if (bestOutlineIdx !== -1 && bestScore > 0) {
                        medianToOutline.set(mIdx, bestOutlineIdx);
                    } else {
                        // Fallback: closest centroid
                        const mCentroid = { x: m[Math.floor(m.length/2)][0], y: m[Math.floor(m.length/2)][1] };
                        let closestOIdx = -1;
                        let minDist = Number.MAX_VALUE;
                        splitOutlines.forEach((outlineObj, oIdx) => {
                            const d = dist(mCentroid, getPolygonCentroid(outlineObj.points));
                            if (d < minDist) { minDist = d; closestOIdx = oIdx; }
                        });
                        if (closestOIdx !== -1 && minDist < 100) {
                            medianToOutline.set(mIdx, closestOIdx);
                        }
                    }
                });

                // 2. For each outline, assign its medians
                splitOutlines.forEach((outlineObj, oIdx) => {
                    const assignedMedians = allSplitMedians.filter((_, mIdx) => medianToOutline.get(mIdx) === oIdx);
                    
                    if (assignedMedians.length > 0) {
                        // Create a separate stroke for EACH assigned median!
                        // Since we group by outline at the start, this won't cause exponential duplication.
                        // It just means this outline is drawn multiple times, each time filling a different part.
                        assignedMedians.forEach(m => {
                            newStrokes.push(outlineObj.path);
                            newMedians.push(m);
                        });
                    } else {
                        // Fallback: Outline exists but no median assigned. Create a dummy median.
                        const c = getPolygonCentroid(outlineObj.points);
                        const dummyMedian = [[c.x, c.y], [c.x+0.1, c.y+0.1]];
                        newStrokes.push(outlineObj.path);
                        newMedians.push(dummyMedian);
                    }
                });
                
            } else {
                 // No outlines left? If medians exist, they are ghost medians. Discard.
                 hasChanged = true;
            }

        } else {
            // Too far, keep original
            medians.forEach(m => {
                newStrokes.push(pathStr);
                newMedians.push(m);
            });
        }
    }

    if (hasChanged) {
        const newData = {
            ...hanziData,
            strokes: newStrokes,
            medians: newMedians
        };
        
        // Update history
        const newHistory = history.slice(0, historyIndex + 1);
        newHistory.push(newData);
        setHistory(newHistory);
        setHistoryIndex(newHistory.length - 1);
        
        setHanziData(newData);
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
      <div className="flex flex-col items-center space-y-6 mb-8 w-full max-w-md">
        
        {/* Search Bar */}
        <form onSubmit={handleSearch} className="w-full relative group">
          <input
            type="text"
            value={searchTerm}
            onChange={(e) => setSearchTerm(e.target.value)}
            placeholder="Search character (e.g. 永, 和, 禅)"
            className="w-full px-6 py-3 rounded-full bg-white border border-gray-200 shadow-sm focus:ring-2 focus:ring-blue-500 focus:border-transparent outline-none transition-all pr-12 text-gray-700"
          />
          <button
            type="submit"
            disabled={isLoading}
            className="absolute right-2 top-1/2 -translate-y-1/2 p-2 text-gray-400 hover:text-blue-600 transition-colors"
          >
            {isLoading ? (
              <svg className="animate-spin h-5 w-5" viewBox="0 0 24 24">
                <circle className="opacity-25" cx="12" cy="12" r="10" stroke="currentColor" strokeWidth="4" fill="none"></circle>
                <path className="opacity-75" fill="currentColor" d="M4 12a8 8 0 018-8V0C5.373 0 0 5.373 0 12h4zm2 5.291A7.962 7.962 0 014 12H0c0 3.042 1.135 5.824 3 7.938l3-2.647z"></path>
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
                <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M21 21l-6-6m2-5a7 7 0 11-14 0 7 7 0 0114 0z" />
              </svg>
            )}
          </button>
          {error && <p className="absolute -bottom-6 left-6 text-xs text-red-500">{error}</p>}
        </form>

        <div className="flex space-x-4">
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
                          <span className="block text-sm font-semibold text-gray-400 uppercase tracking-wide">Strokes</span>
                          <span className="text-2xl font-medium text-gray-700">{hanziData.strokes.length}</span>
                      </div>
                  </div>
                  <div className="space-y-2">
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
                  onUndo={handleUndo}
                  onClear={handleClear}
                  canUndo={historyIndex > 0}
                  config={config}
                  setConfig={setConfig}
               />
          </div>

        </div>
      ) : (
        <div className="w-full max-w-4xl">
          <KotlinCodeTab data={hanziData} />
        </div>
      )}

       <footer className="mt-16 text-center text-sm text-gray-400">
        <p>© {new Date().getFullYear()} Hanzi Zen. Visualization using SVG Paths & Canvas 2D.</p>
      </footer>

    </div>
  );
};

export default App;
