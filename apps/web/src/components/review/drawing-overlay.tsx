"use client";

import React, { useRef, useState, useEffect } from "react";
import { Pen, MoveRight, Square, RotateCcw, X, Check } from "lucide-react";

export type DrawingTool = "pen" | "arrow" | "rect";

export interface DrawingShape {
  id: string;
  tool: DrawingTool;
  color: string;
  points?: Array<{ x: number; y: number }>; // For pen (normalized 0..1)
  start?: { x: number; y: number }; // For arrow / rect (normalized 0..1)
  end?: { x: number; y: number };
}

export interface DrawingData {
  shapes: DrawingShape[];
}

interface DrawingOverlayProps {
  isEditing: boolean;
  drawingData?: DrawingData | null;
  onSaveDrawing?: (data: DrawingData | null) => void;
  onClose?: () => void;
  activeColor?: string;
  onColorChange?: (color: string) => void;
}

const PALETTE = ["#FF5500", "#FFB800", "#FF334B", "#0088FF", "#FFFFFF"];

export function DrawingOverlay({
  isEditing,
  drawingData,
  onSaveDrawing,
  onClose,
  activeColor = "#FF5500",
  onColorChange,
}: DrawingOverlayProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const [tool, setTool] = useState<DrawingTool>("pen");
  const [color, setColor] = useState<string>(activeColor);
  const [shapes, setShapes] = useState<DrawingShape[]>(drawingData?.shapes || []);
  const [currentShape, setCurrentShape] = useState<DrawingShape | null>(null);
  const [isDrawing, setIsDrawing] = useState(false);

  useEffect(() => {
    if (drawingData?.shapes) {
      setShapes(drawingData.shapes);
    } else if (!isEditing) {
      setShapes([]);
    }
  }, [drawingData, isEditing]);

  const getNormalizedCoords = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!containerRef.current) return { x: 0, y: 0 };
    const rect = containerRef.current.getBoundingClientRect();
    const x = Math.max(0, Math.min(1, (e.clientX - rect.left) / rect.width));
    const y = Math.max(0, Math.min(1, (e.clientY - rect.top) / rect.height));
    return { x, y };
  };

  const handleMouseDown = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isEditing) return;
    setIsDrawing(true);
    const coords = getNormalizedCoords(e);

    if (tool === "pen") {
      setCurrentShape({
        id: Math.random().toString(36).substring(7),
        tool: "pen",
        color,
        points: [coords],
      });
    } else {
      setCurrentShape({
        id: Math.random().toString(36).substring(7),
        tool,
        color,
        start: coords,
        end: coords,
      });
    }
  };

  const handleMouseMove = (e: React.MouseEvent<HTMLDivElement>) => {
    if (!isDrawing || !currentShape || !isEditing) return;
    const coords = getNormalizedCoords(e);

    if (tool === "pen") {
      setCurrentShape((prev) => {
        if (!prev || !prev.points) return prev;
        return {
          ...prev,
          points: [...prev.points, coords],
        };
      });
    } else {
      setCurrentShape((prev) => {
        if (!prev) return prev;
        return {
          ...prev,
          end: coords,
        };
      });
    }
  };

  const handleMouseUp = () => {
    if (!isDrawing || !currentShape || !isEditing) return;
    setIsDrawing(false);
    const updated = [...shapes, currentShape];
    setShapes(updated);
    setCurrentShape(null);
    if (onSaveDrawing) {
      onSaveDrawing({ shapes: updated });
    }
  };

  const handleUndo = () => {
    const updated = shapes.slice(0, -1);
    setShapes(updated);
    if (onSaveDrawing) {
      onSaveDrawing(updated.length > 0 ? { shapes: updated } : null);
    }
  };

  const handleClear = () => {
    setShapes([]);
    if (onSaveDrawing) {
      onSaveDrawing(null);
    }
  };

  const renderShape = (shape: DrawingShape) => {
    if (shape.tool === "pen" && shape.points && shape.points.length > 1) {
      const d = shape.points.reduce((acc, pt, idx) => {
        const x = pt.x * 100;
        const y = pt.y * 100;
        return idx === 0 ? `M ${x} ${y}` : `${acc} L ${x} ${y}`;
      }, "");
      return (
        <path
          key={shape.id}
          d={d}
          stroke={shape.color}
          strokeWidth="0.6"
          strokeLinecap="round"
          strokeLinejoin="round"
          fill="none"
        />
      );
    }

    if (shape.tool === "rect" && shape.start && shape.end) {
      const x = Math.min(shape.start.x, shape.end.x) * 100;
      const y = Math.min(shape.start.y, shape.end.y) * 100;
      const w = Math.abs(shape.end.x - shape.start.x) * 100;
      const h = Math.abs(shape.end.y - shape.start.y) * 100;
      return (
        <rect
          key={shape.id}
          x={x}
          y={y}
          width={w}
          height={h}
          stroke={shape.color}
          strokeWidth="0.6"
          fill="none"
          rx="0.5"
        />
      );
    }

    if (shape.tool === "arrow" && shape.start && shape.end) {
      const x1 = shape.start.x * 100;
      const y1 = shape.start.y * 100;
      const x2 = shape.end.x * 100;
      const y2 = shape.end.y * 100;

      // Calculate arrowhead
      const angle = Math.atan2(y2 - y1, x2 - x1);
      const headLen = 2.5; // percentage units
      const arrowX1 = x2 - headLen * Math.cos(angle - Math.PI / 6);
      const arrowY1 = y2 - headLen * Math.sin(angle - Math.PI / 6);
      const arrowX2 = x2 - headLen * Math.cos(angle + Math.PI / 6);
      const arrowY2 = y2 - headLen * Math.sin(angle + Math.PI / 6);

      return (
        <g key={shape.id}>
          <line
            x1={x1}
            y1={y1}
            x2={x2}
            y2={y2}
            stroke={shape.color}
            strokeWidth="0.6"
            strokeLinecap="round"
          />
          <polygon
            points={`${x2},${y2} ${arrowX1},${arrowY1} ${arrowX2},${arrowY2}`}
            fill={shape.color}
          />
        </g>
      );
    }

    return null;
  };

  const hasShapes = shapes.length > 0 || !!currentShape;

  if (!isEditing && !hasShapes) {
    return null;
  }

  return (
    <div
      ref={containerRef}
      onMouseDown={handleMouseDown}
      onMouseMove={handleMouseMove}
      onMouseUp={handleMouseUp}
      className={`absolute inset-0 z-20 ${
        isEditing ? "cursor-crosshair pointer-events-auto" : "pointer-events-none"
      }`}
    >
      {/* SVG Canvas for shapes */}
      <svg
        viewBox="0 0 100 100"
        preserveAspectRatio="none"
        className="w-full h-full pointer-events-none"
      >
        {shapes.map(renderShape)}
        {currentShape && renderShape(currentShape)}
      </svg>

      {/* Editing Toolbar */}
      {isEditing && (
        <div
          onClick={(e) => e.stopPropagation()}
          className="absolute top-4 left-1/2 -translate-x-1/2 flex items-center gap-2 bg-[#1A1A1E]/95 border border-[#2E2E34] px-3 py-1.5 rounded-full shadow-2xl z-30 pointer-events-auto"
        >
          {/* Tool selectors */}
          <div className="flex items-center gap-1 border-r border-[#2E2E34] pr-2">
            <button
              onClick={() => setTool("pen")}
              className={`p-1.5 rounded-full transition-colors ${
                tool === "pen" ? "bg-[#FF5500] text-white" : "text-[#9A9DA0] hover:text-white"
              }`}
              title="Pen (freehand)"
            >
              <Pen className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool("arrow")}
              className={`p-1.5 rounded-full transition-colors ${
                tool === "arrow" ? "bg-[#FF5500] text-white" : "text-[#9A9DA0] hover:text-white"
              }`}
              title="Arrow"
            >
              <MoveRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setTool("rect")}
              className={`p-1.5 rounded-full transition-colors ${
                tool === "rect" ? "bg-[#FF5500] text-white" : "text-[#9A9DA0] hover:text-white"
              }`}
              title="Rectangle"
            >
              <Square className="w-4 h-4" />
            </button>
          </div>

          {/* Color palette */}
          <div className="flex items-center gap-1.5 border-r border-[#2E2E34] pr-2">
            {PALETTE.map((c) => (
              <button
                key={c}
                onClick={() => {
                  setColor(c);
                  if (onColorChange) onColorChange(c);
                }}
                className={`w-5 h-5 rounded-full border transition-transform ${
                  color === c ? "scale-125 border-white ring-2 ring-white/20" : "border-transparent hover:scale-110"
                }`}
                style={{ backgroundColor: c }}
              />
            ))}
          </div>

          {/* Undo and Clear */}
          <div className="flex items-center gap-1">
            <button
              onClick={handleUndo}
              disabled={shapes.length === 0}
              className="p-1.5 rounded-full text-[#9A9DA0] hover:text-white disabled:opacity-40 transition-colors"
              title="Undo"
            >
              <RotateCcw className="w-4 h-4" />
            </button>
            <button
              onClick={handleClear}
              disabled={shapes.length === 0}
              className="px-2 py-0.5 rounded text-xs text-[#9A9DA0] hover:text-white disabled:opacity-40 transition-colors"
            >
              Clear
            </button>
          </div>

          {/* Close / Done */}
          {onClose && (
            <div className="border-l border-[#2E2E34] pl-2 flex items-center">
              <button
                onClick={onClose}
                className="flex items-center gap-1 bg-[#FF5500] hover:bg-[#e04b00] text-white text-xs font-medium px-2.5 py-1 rounded-full transition-colors"
              >
                <Check className="w-3.5 h-3.5" />
                <span>Done</span>
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
