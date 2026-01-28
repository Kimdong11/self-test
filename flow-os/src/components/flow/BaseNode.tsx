'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { cn } from '@/lib/utils';
import type { FlowNode } from '@/lib/store';

export type BaseNodeProps = NodeProps<FlowNode> & {
  className?: string;
};

export const BaseNode = memo(function BaseNode({
  data,
  selected,
  className,
}: BaseNodeProps) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'px-4 py-3 rounded-xl border-2 min-w-[150px]',
        'bg-flow-surface backdrop-blur-sm',
        'transition-all duration-200',
        selected
          ? 'border-flow-accent shadow-lg shadow-flow-accent/30 glow-accent-sm'
          : 'border-flow-border hover:border-flow-accent/50',
        className
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-flow-accent !border-2 !border-flow-bg-dark !-top-1.5"
      />
      
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-flow-text">
          {data.label}
        </span>
        {data.type && (
          <span className="text-xs text-flow-text-muted capitalize">
            {data.type}
          </span>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-flow-accent !border-2 !border-flow-bg-dark !-bottom-1.5"
      />
    </motion.div>
  );
});

export default BaseNode;
