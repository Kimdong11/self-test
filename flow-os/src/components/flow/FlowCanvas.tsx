'use client';

import { useCallback, useEffect } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Panel,
  useReactFlow,
  ReactFlowProvider,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion } from 'framer-motion';
import { Plus, Trash2, LayoutGrid } from 'lucide-react';
import { useFlowStore } from '@/lib/store';
import { nodeTypes } from './index';
import { cn } from '@/lib/utils';

interface FlowCanvasProps {
  className?: string;
}

// Inner component that uses useReactFlow (must be inside ReactFlowProvider)
function FlowCanvasInner({ className }: FlowCanvasProps) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    clearFlow,
    applyLayout,
    shouldFitView,
    setShouldFitView,
  } = useFlowStore();

  const { fitView } = useReactFlow();

  // Smooth fitView animation when shouldFitView flag is set
  useEffect(() => {
    if (shouldFitView && nodes.length > 0) {
      // Small delay to ensure nodes are rendered
      const timeoutId = setTimeout(() => {
        fitView({
          duration: 800,
          padding: 0.2,
        });
        setShouldFitView(false);
      }, 100);

      return () => clearTimeout(timeoutId);
    }
  }, [shouldFitView, nodes.length, fitView, setShouldFitView]);

  const handleAddNode = useCallback(() => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: 'workflow',
      position: { x: 0, y: 0 }, // Position will be calculated by addNode
      data: { label: `Step ${nodes.length + 1}` },
    };
    addNode(newNode);
  }, [addNode, nodes.length]);

  const handleAutoLayout = useCallback(() => {
    applyLayout();
  }, [applyLayout]);

  return (
    <div className={cn('w-full h-full relative', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        fitViewOptions={{
          padding: 0.2,
          duration: 800,
        }}
        proOptions={{ hideAttribution: true }}
        defaultEdgeOptions={{
          style: { stroke: '#00F0FF', strokeWidth: 2 },
          animated: true,
        }}
        style={{ backgroundColor: '#1A1A2E' }}
        minZoom={0.1}
        maxZoom={2}
      >
        {/* Dotted Grid Background */}
        <Background
          variant={BackgroundVariant.Dots}
          gap={24}
          size={1.5}
          color="#2D2D4A"
        />
        
        {/* Controls */}
        <Controls 
          showInteractive={false}
          className="!bg-flow-surface !border !border-flow-border !rounded-lg !shadow-xl"
        />
        
        {/* MiniMap */}
        <MiniMap
          nodeColor={(node) => node.selected ? '#00F0FF' : '#252540'}
          maskColor="rgba(26, 26, 46, 0.8)"
          className="!bg-flow-surface !border !border-flow-border !rounded-lg"
          pannable
          zoomable
        />
        
        {/* Top Panel with Actions */}
        <Panel position="top-left" className="flex gap-2 m-4">
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={handleAddNode}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg',
              'bg-flow-accent text-flow-bg-dark font-medium text-sm',
              'shadow-lg shadow-flow-accent/20',
              'hover:shadow-flow-accent/40 transition-all duration-200'
            )}
          >
            <Plus className="w-4 h-4" />
            Add Node
          </motion.button>
          
          {nodes.length > 1 && (
            <motion.button
              initial={{ opacity: 0, scale: 0.9 }}
              animate={{ opacity: 1, scale: 1 }}
              whileHover={{ scale: 1.02 }}
              whileTap={{ scale: 0.98 }}
              onClick={handleAutoLayout}
              className={cn(
                'flex items-center gap-2 px-4 py-2.5 rounded-lg',
                'bg-flow-surface border border-flow-border text-flow-text font-medium text-sm',
                'hover:border-flow-accent hover:text-flow-accent transition-all duration-200'
              )}
            >
              <LayoutGrid className="w-4 h-4" />
              Auto Layout
            </motion.button>
          )}
          
          <motion.button
            whileHover={{ scale: 1.02 }}
            whileTap={{ scale: 0.98 }}
            onClick={clearFlow}
            className={cn(
              'flex items-center gap-2 px-4 py-2.5 rounded-lg',
              'bg-flow-surface border border-flow-border text-flow-text font-medium text-sm',
              'hover:border-destructive hover:text-destructive transition-all duration-200'
            )}
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </motion.button>
        </Panel>

        {/* Bottom Right Panel - Stats */}
        <Panel position="bottom-right" className="m-4">
          <div className="flex items-center gap-4 px-4 py-2 rounded-lg bg-flow-surface/80 backdrop-blur-sm border border-flow-border text-xs text-flow-text-muted">
            <span>
              <span className="text-flow-accent font-medium">{nodes.length}</span> nodes
            </span>
            <span className="w-px h-3 bg-flow-border" />
            <span>
              <span className="text-flow-accent font-medium">{edges.length}</span> connections
            </span>
          </div>
        </Panel>

        {/* Empty State - Welcome Message */}
        {nodes.length === 0 && (
          <div className="absolute inset-0 flex items-center justify-center pointer-events-none">
            <motion.div
              initial={{ opacity: 0, scale: 0.95 }}
              animate={{ opacity: 1, scale: 1 }}
              transition={{ duration: 0.5, ease: 'easeOut' }}
              className="text-center px-8"
            >
              <motion.h1 
                className="text-4xl md:text-5xl font-bold text-flow-text-muted/30 mb-4 select-none"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.2 }}
              >
                Welcome to Flow-OS
              </motion.h1>
              <motion.p 
                className="text-lg md:text-xl text-flow-text-muted/50 max-w-md mx-auto select-none"
                initial={{ opacity: 0, y: 20 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: 0.4 }}
              >
                Type in the chat to generate your first workflow.
              </motion.p>
              <motion.div
                className="mt-8 flex items-center justify-center gap-2 text-flow-text-muted/40"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
                transition={{ delay: 0.6 }}
              >
                <span className="text-sm">Try:</span>
                <code className="px-3 py-1.5 rounded-lg bg-flow-surface/50 text-flow-accent/60 text-sm font-mono">
                  Login → Validate → Dashboard
                </code>
              </motion.div>
            </motion.div>
          </div>
        )}
      </ReactFlow>
    </div>
  );
}

// Wrapper component that provides ReactFlowProvider
export function FlowCanvas({ className }: FlowCanvasProps) {
  return (
    <ReactFlowProvider>
      <FlowCanvasInner className={className} />
    </ReactFlowProvider>
  );
}

export default FlowCanvas;
