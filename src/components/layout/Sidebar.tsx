'use client';

import { ReactNode } from 'react';
import { FileUp, Settings } from 'lucide-react';
import { Button } from '@/components/ui/Button';

interface SidebarProps {
  onUpload: () => void;
  onOpenSettings: () => void;
}

export function Sidebar({ onUpload, onOpenSettings }: SidebarProps) {
  return (
    <aside className="w-[280px] border-r border-[#E8E8E8] bg-white flex flex-col">
      <div className="p-6 border-b border-[#E8E8E8]">
        <h1 className="text-2xl font-bold text-[#E42313]">AI Reader</h1>
      </div>

      <nav className="flex-1 p-4 space-y-2">
        <Button onClick={onUpload} className="w-full flex items-center gap-2">
          <FileUp size={20} />
          Upload PDF
        </Button>

        <Button variant="secondary" onClick={onOpenSettings} className="w-full flex items-center gap-2">
          <Settings size={20} />
          Settings
        </Button>
      </nav>

      <div className="p-4 border-t border-[#E8E8E8]">
        <p className="text-xs text-gray-500">v1.0.0 - MVP</p>
      </div>
    </aside>
  );
}
