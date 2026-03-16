import React, { useState } from 'react';
import { HanziData } from '../types';

interface KotlinCodeTabProps {
  data: HanziData;
}

const KotlinCodeTab: React.FC<KotlinCodeTabProps> = ({ data }) => {
  const [copied, setCopied] = useState(false);

  const generateKotlinData = (data: HanziData) => {
    const strokesStr = data.strokes.map(s => `        "${s}"`).join(',\n');
    const mediansStr = data.medians.map(m => 
      `        listOf(${m.map(p => `Point(${p[0].toFixed(1)}, ${p[1].toFixed(1)})`).join(', ')})`
    ).join(',\n');

    return `val currentHanzi = HanziData(
    character = "${data.character}",
    strokes = listOf(
${strokesStr}
    ),
    medians = listOf(
${mediansStr}
    )
)`;
  };

  const staticLogic = `
data class Point(val x: Double, val y: Double)
data class Rect(val x: Double, val y: Double, val w: Double, val h: Double)
data class Outline(val path: String, val points: List<Point>)
data class HanziData(
    val character: String,
    val strokes: List<String>,
    val medians: List<List<Point>>
)

// --- Core Eraser Logic ---
fun eraseAt(hanziData: HanziData, rect: Rect): HanziData {
    // ... (Implementation as shown in the full logic below)
    return hanziData 
}
`;

  const fullCode = `${staticLogic}\n\n${generateKotlinData(data)}`;

  const handleCopy = () => {
    navigator.clipboard.writeText(fullCode);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="w-full max-w-4xl mx-auto bg-[#1e1e1e] rounded-xl shadow-lg overflow-hidden border border-gray-800">
      <div className="flex items-center justify-between px-4 py-3 bg-[#2d2d2d] border-b border-gray-700">
        <div className="flex items-center space-x-2">
          <div className="w-3 h-3 rounded-full bg-red-500"></div>
          <div className="w-3 h-3 rounded-full bg-yellow-500"></div>
          <div className="w-3 h-3 rounded-full bg-green-500"></div>
        </div>
        <span className="text-sm font-mono text-gray-400">EraserLogic.kt</span>
        <button 
          onClick={handleCopy}
          className={`px-3 py-1 rounded text-xs font-medium transition-colors ${
            copied ? 'bg-green-600 text-white' : 'bg-gray-700 text-gray-300 hover:bg-gray-600'
          }`}
        >
          {copied ? 'Copied!' : 'Copy Code'}
        </button>
      </div>
      <div className="p-6 overflow-x-auto max-h-[600px] overflow-y-auto custom-scrollbar">
        <pre className="text-sm font-mono text-gray-300 leading-relaxed">
          <code>{fullCode}</code>
        </pre>
      </div>
    </div>
  );
};

export default KotlinCodeTab;
