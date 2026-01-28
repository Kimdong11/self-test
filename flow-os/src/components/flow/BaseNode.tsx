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
        'px-4 py-3 shadow-lg rounded-xl border-2 bg-background min-w-[150px]',
        'transition-colors duration-200',
        selected
          ? 'border-primary shadow-primary/20'
          : 'border-border hover:border-primary/50',
        className
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
      
      <div className="flex flex-col gap-1">
        <span className="text-sm font-medium text-foreground">
          {data.label}
        </span>
        {data.type && (
          <span className="text-xs text-muted-foreground capitalize">
            {data.type}
          </span>
        )}
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </motion.div>
  );
});

export default BaseNode;
