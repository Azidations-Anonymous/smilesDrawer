import Line = require('../../graph/Line');
import Vertex = require('../../graph/Vertex');
import Vector2 = require('../../graph/Vector2');
import { AttachedPseudoElements } from '../../config/IOptions';
import { TextDirection } from '../../types/CommonTypes';

interface IDrawingSurface {
  determineDimensions(vertices: Vertex[]): void;
  getBounds(): IDrawingSurface.Bounds;
  drawLine(line: Line, dashed?: boolean, gradient?: string | null, linecap?: string): void;
  drawWedge(line: Line): void;
  drawDashedWedge(line: Line): void;
  drawRing(x: number, y: number, radius: number): void;
  drawAtomHighlight(x: number, y: number, color?: string): void;
  drawBall(x: number, y: number, elementName: string): void;
  drawPoint(x: number, y: number, elementName: string): void;
  drawDebugPoint(x: number, y: number, debugText?: string, color?: string): void;
  drawDebugText(x: number, y: number, text: string): void;
  drawDashedPolygon?(points: Vector2[], color?: string): void;
  drawAnnotation?(x: number, y: number, text: string, options?: { fontSize?: number; color?: string }): void;
  drawText(
    x: number,
    y: number,
    elementName: string,
    hydrogens: number,
    direction: TextDirection,
    isTerminal: boolean,
    charge: number,
    isotope: number,
    totalVertices: number,
    attachedPseudoElement?: AttachedPseudoElements
  ): void;
  addLayer?(layer: any): void;
  finalize(): void;
  toCanvas?(canvas: HTMLCanvasElement, width: number, height: number): void;
}

namespace IDrawingSurface {
  export interface Bounds {
    minX: number;
    minY: number;
    maxX: number;
    maxY: number;
    width: number;
    height: number;
  }
}

export = IDrawingSurface;
