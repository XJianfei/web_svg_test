export interface HanziData {
  character: string;
  strokes: string[];
  medians: number[][][];
}

export interface Point {
  x: number;
  y: number;
}

export interface AnimationConfig {
  speed: number; // Multiplier 0.5x to 2x
  loop: boolean;
  showMedians: boolean;
  showGrid: boolean;
  showOutline: boolean;
  eraserSize: number;
}
