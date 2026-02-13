"use client";

import React from "react";
import { DesktopContainer } from "@/components/ui/desktop-container";
import { HugeiconsIcon } from "@hugeicons/react";
import { ComputerIcon, InformationCircleIcon } from "@hugeicons/core-free-icons";

export default function DesktopPage() {
  return (
    <div className="flex h-screen flex-col overflow-hidden bg-background">
      {/* Header */}
      <div className="flex items-center justify-between px-6 py-4 border-b border-white/5 bg-secondary/20">
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-lg bg-folonite-bronze/20 flex items-center justify-center">
            <HugeiconsIcon icon={ComputerIcon} className="h-5 w-5 text-folonite-bronze" />
          </div>
          <div>
            <h1 className="text-white font-semibold">Live Desktop</h1>
            <p className="text-xs text-gray-500">Real-time desktop interaction</p>
          </div>
        </div>
        <div className="flex items-center gap-2 px-3 py-1.5 rounded-full bg-green-500/10 border border-green-500/20">
          <div className="h-2 w-2 rounded-full bg-green-500 animate-pulse" />
          <span className="text-xs text-green-400 font-medium">Connected</span>
        </div>
      </div>

      {/* Main Content - Full width desktop */}
      <main className="flex-1 overflow-hidden p-4 md:p-6">
        <div className="h-full flex items-center justify-center">
          <div className="w-full h-full max-w-7xl">
            <DesktopContainer 
              viewOnly={false} 
              status="live_view"
              className="h-full shadow-2xl shadow-black/20"
            >
              {/* No action buttons for desktop page */}
            </DesktopContainer>
          </div>
        </div>
      </main>

      {/* Info Footer */}
      <div className="px-6 py-3 border-t border-white/5 bg-secondary/10">
        <div className="flex items-center justify-center gap-2 text-xs text-gray-500">
          <HugeiconsIcon icon={InformationCircleIcon} className="h-4 w-4" />
          <span>Click and interact with the desktop directly. Your actions are recorded when tasks are running.</span>
        </div>
      </div>
    </div>
  );
}
