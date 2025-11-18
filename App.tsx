import React, { useState } from 'react';
import HanziCanvas from './components/HanziCanvas';
import Controls from './components/Controls';
import { CHARACTER_DATA } from './constants';
import { AnimationConfig } from './types';

const App: React.FC = () => {
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
    setIsPlaying(false);
    // Small timeout to allow state to clear before restarting
    setTimeout(() => setIsPlaying(true), 10);
  };

  return (
    <div className="min-h-screen flex flex-col items-center py-12 px-4 sm:px-6 lg:px-8">
      
      {/* Header */}
      <div className="text-center mb-10">
        <h1 className="text-4xl font-extrabold text-gray-900 tracking-tight font-serif" style={{ fontFamily: "'ZCOOL XiaoWei', serif" }}>
          Hanzi Zen
        </h1>
        <p className="mt-2 text-base text-gray-500 max-w-md mx-auto">
          Experience the flow of Chinese calligraphy stroke by stroke.
        </p>
      </div>

      {/* Main Content Card */}
      <div className="w-full max-w-3xl flex flex-col md:flex-row gap-8 items-start justify-center">
        
        {/* Left: Canvas */}
        <div className="w-full md:w-auto flex-shrink-0 flex justify-center">
            <div className="relative group">
                <HanziCanvas 
                    data={CHARACTER_DATA} 
                    config={config} 
                    isPlaying={isPlaying}
                    onAnimationEnd={handleAnimationEnd}
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
                    <h2 className="text-6xl font-bold text-gray-800 font-serif">{CHARACTER_DATA.character}</h2>
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
                        <span className="font-medium text-gray-800">{CHARACTER_DATA.strokes.length}</span>
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