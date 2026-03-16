import React from 'react';
import { AnimationConfig } from '../types';

interface ControlsProps {
  isPlaying: boolean;
  onTogglePlay: () => void;
  onReset: () => void;
  onUndo: () => void;
  onClear: () => void;
  canUndo: boolean;
  config: AnimationConfig;
  setConfig: React.Dispatch<React.SetStateAction<AnimationConfig>>;
}

const Controls: React.FC<ControlsProps> = ({ isPlaying, onTogglePlay, onReset, onUndo, onClear, canUndo, config, setConfig }) => {
  
  const toggleConfig = (key: keyof AnimationConfig) => {
    setConfig(prev => ({ ...prev, [key]: !prev[key] }));
  };

  const setSpeed = (speed: number) => {
    setConfig(prev => ({ ...prev, speed }));
  };

  return (
    <div className="w-full max-w-md mx-auto mt-6 space-y-6">
      
      {/* Playback Controls */}
      <div className="flex items-center justify-center space-x-4">
        <button
          onClick={onReset}
          className="p-3 rounded-full bg-gray-100 hover:bg-gray-200 text-gray-600 transition-colors"
          title="Reset to Original"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M4 4v5h.582m15.356 2A8.001 8.001 0 004.582 9m0 0H9m11 11v-5h-.581m0 0a8.003 8.003 0 01-15.357-2m15.357 2H15" />
          </svg>
        </button>

        <button
          onClick={onUndo}
          disabled={!canUndo}
          className={`p-3 rounded-full transition-colors ${canUndo ? 'bg-gray-100 hover:bg-gray-200 text-gray-600' : 'bg-gray-50 text-gray-300 cursor-not-allowed'}`}
          title="Undo"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M3 10h10a8 8 0 018 8v2M3 10l6 6m-6-6l6-6" />
          </svg>
        </button>

        <button
          onClick={onTogglePlay}
          className={`p-4 rounded-full shadow-lg transition-all transform hover:scale-105 active:scale-95 ${
            isPlaying 
              ? 'bg-amber-500 hover:bg-amber-600 text-white' 
              : 'bg-blue-600 hover:bg-blue-700 text-white'
          }`}
        >
          {isPlaying ? (
            <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M18 18.72a.75.75 0 00.75-.75V6.03a.75.75 0 00-.75-.75h-2a.75.75 0 00-.75.75v11.94a.75.75 0 00.75.75h2zm-9 0a.75.75 0 00.75-.75V6.03a.75.75 0 00-.75-.75h-2a.75.75 0 00-.75.75v11.94a.75.75 0 00.75.75h2z" clipRule="evenodd" />
            </svg>
          ) : (
             <svg className="w-8 h-8" fill="currentColor" viewBox="0 0 24 24">
              <path fillRule="evenodd" d="M4.5 5.653c0-1.426 1.529-2.33 2.779-1.643l11.54 6.348c1.295.712 1.295 2.573 0 3.285L7.28 19.991c-1.25.687-2.779-.217-2.779-1.643V5.653z" clipRule="evenodd" />
            </svg>
          )}
        </button>

        <button
          onClick={onClear}
          className="p-3 rounded-full bg-red-50 hover:bg-red-100 text-red-600 transition-colors"
          title="Clear All Strokes"
        >
          <svg className="w-6 h-6" fill="none" stroke="currentColor" viewBox="0 0 24 24">
            <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
          </svg>
        </button>
      </div>

      {/* Toggles */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 grid grid-cols-2 gap-4 text-sm text-gray-700">
        
        <label className="flex items-center justify-between cursor-pointer group">
          <span>Show Grid</span>
          <div className="relative">
            <input 
              type="checkbox" 
              checked={config.showGrid} 
              onChange={() => toggleConfig('showGrid')} 
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </div>
        </label>

         <label className="flex items-center justify-between cursor-pointer group">
          <span>Medians</span>
          <div className="relative">
            <input 
              type="checkbox" 
              checked={config.showMedians} 
              onChange={() => toggleConfig('showMedians')} 
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </div>
        </label>

         <label className="flex items-center justify-between cursor-pointer group">
          <span>Loop</span>
          <div className="relative">
            <input 
              type="checkbox" 
              checked={config.loop} 
              onChange={() => toggleConfig('loop')} 
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </div>
        </label>
        
         <label className="flex items-center justify-between cursor-pointer group">
          <span>Ghost Outline</span>
          <div className="relative">
            <input 
              type="checkbox" 
              checked={config.showOutline} 
              onChange={() => toggleConfig('showOutline')} 
              className="sr-only peer"
            />
            <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none rounded-full peer peer-checked:after:translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-blue-600"></div>
          </div>
        </label>

      </div>

      {/* Speed Control */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col space-y-2">
        <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Animation Speed</span>
        <div className="flex justify-between space-x-2">
            {[0.5, 1, 1.5, 2].map((s) => (
                <button
                    key={s}
                    onClick={() => setSpeed(s)}
                    className={`flex-1 py-1.5 rounded-md text-sm font-medium transition-colors ${
                        config.speed === s
                        ? 'bg-blue-100 text-blue-700 border border-blue-200'
                        : 'bg-gray-50 text-gray-600 hover:bg-gray-100 border border-transparent'
                    }`}
                >
                    {s}x
                </button>
            ))}
        </div>
      </div>

      {/* Eraser Size Control */}
      <div className="bg-white p-4 rounded-xl shadow-sm border border-gray-100 flex flex-col space-y-2">
        <div className="flex justify-between items-center">
          <span className="text-xs font-semibold text-gray-400 uppercase tracking-wider">Eraser Size</span>
          <span className="text-xs font-medium text-gray-600">{config.eraserSize}px</span>
        </div>
        <input
          type="range"
          min="5"
          max="50"
          value={config.eraserSize}
          onChange={(e) => setConfig(prev => ({ ...prev, eraserSize: parseInt(e.target.value, 10) }))}
          className="w-full h-2 bg-gray-200 rounded-lg appearance-none cursor-pointer accent-blue-600"
        />
      </div>

    </div>
  );
};

export default Controls;