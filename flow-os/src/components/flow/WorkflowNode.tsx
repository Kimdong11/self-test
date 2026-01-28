'use client';

import { memo } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Workflow } from 'lucide-react';
import { cn } from '@/lib/utils';
import type { FlowNode } from '@/lib/store';

export type WorkflowNodeProps = NodeProps<FlowNode> & {
  className?: string;
};

export const WorkflowNode = memo(function WorkflowNode({
  data,
  selected,
  className,
}: WorkflowNodeProps) {
  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.2 }}
      className={cn(
        'px-4 py-3 shadow-lg rounded-xl border-2 bg-gradient-to-br from-background to-muted min-w-[180px]',
        'transition-all duration-200',
        selected
          ? 'border-primary shadow-primary/30 shadow-xl'
          : 'border-border hover:border-primary/50 hover:shadow-xl',
        className
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
      
      <div className="flex items-center gap-3">
        <div className="p-2 rounded-lg bg-primary/10 text-primary">
          <Workflow className="w-5 h-5" />
        </div>
        <div className="flex flex-col gap-0.5">
          <span className="text-sm font-semibold text-foreground">
            {data.label}
          </span>
          <span className="text-xs text-muted-foreground">
            Workflow Step
          </span>
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-primary !border-2 !border-background"
      />
    </motion.div>
  );
});

export default WorkflowNode;
