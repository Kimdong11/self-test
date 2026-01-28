'use client';

import { useCallback } from 'react';
import {
  ReactFlow,
  Background,
  Controls,
  MiniMap,
  BackgroundVariant,
  Panel,
} from '@xyflow/react';
import '@xyflow/react/dist/style.css';
import { motion } from 'framer-motion';
import { Plus, Trash2 } from 'lucide-react';
import { useFlowStore } from '@/lib/store';
import { nodeTypes } from './index';
import { cn } from '@/lib/utils';

interface FlowCanvasProps {
  className?: string;
}

export function FlowCanvas({ className }: FlowCanvasProps) {
  const {
    nodes,
    edges,
    onNodesChange,
    onEdgesChange,
    onConnect,
    addNode,
    clearFlow,
  } = useFlowStore();

  const handleAddNode = useCallback(() => {
    const newNode = {
      id: `node-${Date.now()}`,
      type: 'workflow',
      position: {
        x: Math.random() * 400 + 100,
        y: Math.random() * 400 + 100,
      },
      data: { label: `New Step ${nodes.length + 1}` },
    };
    addNode(newNode);
  }, [addNode, nodes.length]);

  return (
    <div className={cn('w-full h-full', className)}>
      <ReactFlow
        nodes={nodes}
        edges={edges}
        onNodesChange={onNodesChange}
        onEdgesChange={onEdgesChange}
        onConnect={onConnect}
        nodeTypes={nodeTypes}
        fitView
        className="bg-background"
        proOptions={{ hideAttribution: true }}
      >
        <Background
          variant={BackgroundVariant.Dots}
          gap={20}
          size={1}
          className="!bg-muted/30"
        />
        <Controls className="!bg-background !border-border !shadow-lg" />
        <MiniMap
          className="!bg-background !border-border"
          nodeColor={(node) => (node.selected ? 'hsl(var(--primary))' : 'hsl(var(--muted))')}
        />
        
        <Panel position="top-left" className="flex gap-2">
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={handleAddNode}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg',
              'bg-primary text-primary-foreground shadow-lg',
              'hover:bg-primary/90 transition-colors'
            )}
          >
            <Plus className="w-4 h-4" />
            Add Node
          </motion.button>
          
          <motion.button
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            onClick={clearFlow}
            className={cn(
              'flex items-center gap-2 px-4 py-2 rounded-lg',
              'bg-destructive text-destructive-foreground shadow-lg',
              'hover:bg-destructive/90 transition-colors'
            )}
          >
            <Trash2 className="w-4 h-4" />
            Clear
          </motion.button>
        </Panel>
      </ReactFlow>
    </div>
  );
}

export default FlowCanvas;
