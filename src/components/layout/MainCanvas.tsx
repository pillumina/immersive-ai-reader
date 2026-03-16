'use client';

import { ReactNode } from 'react';
import { ZoomIn, ZoomOut } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface MainCanvasProps {
  zoomLevel: number;
  onZoomIn: () => void;
  onZoomOut: () => void;
  hasDocument: boolean;
}

export function MainCanvas({ zoomLevel, onZoomIn, onZoomOut, hasDocument }: MainCanvasProps) {
  return (
    <main className="flex-1 flex flex-col bg-[#E8E8E8]">
      <div className="h-12 border-b border-[#E8E8E8] bg-white flex items-center justify-between px-4">
        <div className="flex items-center gap-2">
          <Button variant="secondary" size="sm" onClick={onZoomIn}>
            <ZoomIn size={16} />
          </Button>
          <Button variant="secondary" size="sm" onClick={onZoomOut}>
            <ZoomOut size={16} />
          </Button>
          <span className="text-sm text-gray-600 ml-2">{Math.round(zoomLevel * 100)}%</span>
        </div>
      </div>

      <div className="flex-1 overflow-auto p-4">
        {hasDocument ? (
          <canvas id="pdf-canvas" className="bg-white shadow-lg" />
        ) : (
          <div className="h-full flex items-center justify-center">
            <p className="text-gray-400">Upload a PDF to get started</p>
          </div>
        )}
      </div>
    </main>
  );
}
