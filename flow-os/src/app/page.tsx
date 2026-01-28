'use client';

import { FlowCanvas } from '@/components/flow';
import { ChatPanel } from '@/components/chat';

export default function Home() {
  return (
    <div className="flex h-screen w-full overflow-hidden bg-flow-bg-dark">
      {/* Left Panel - Chat Interface (30% width) */}
      <aside className="w-[30%] min-w-[320px] max-w-[420px] h-full flex-shrink-0 border-r border-flow-border">
        <ChatPanel className="h-full" />
      </aside>
      
      {/* Right Panel - Flow Canvas (70% width) */}
      <main className="flex-1 h-full">
        <FlowCanvas className="h-full" />
      </main>
    </div>
  );
}
