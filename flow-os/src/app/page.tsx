'use client';

import { FlowCanvas } from '@/components/flow';
import { ChatPanel } from '@/components/chat';

export default function Home() {
  return (
    <div className="flex h-screen w-full">
      {/* Flow Canvas - Main Area */}
      <div className="flex-1 h-full">
        <FlowCanvas />
      </div>
      
      {/* Chat Panel - Sidebar */}
      <div className="w-[400px] h-full">
        <ChatPanel />
      </div>
    </div>
  );
}
