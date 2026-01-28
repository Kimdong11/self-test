'use client';

import { memo, useState, useRef, useEffect, useCallback } from 'react';
import { Handle, Position, NodeProps } from '@xyflow/react';
import { motion } from 'framer-motion';
import { Workflow, Check, X } from 'lucide-react';
import { cn } from '@/lib/utils';
import { useFlowStore, type FlowNode } from '@/lib/store';

export type WorkflowNodeProps = NodeProps<FlowNode> & {
  className?: string;
};

export const WorkflowNode = memo(function WorkflowNode({
  id,
  data,
  selected,
  className,
}: WorkflowNodeProps) {
  const [isEditing, setIsEditing] = useState(false);
  const [editValue, setEditValue] = useState(data.label);
  const inputRef = useRef<HTMLInputElement>(null);
  
  const updateNode = useFlowStore((state) => state.updateNode);

  // Focus input when entering edit mode
  useEffect(() => {
    if (isEditing && inputRef.current) {
      inputRef.current.focus();
      inputRef.current.select();
    }
  }, [isEditing]);

  // Sync edit value when data changes externally
  useEffect(() => {
    if (!isEditing) {
      setEditValue(data.label);
    }
  }, [data.label, isEditing]);

  const handleDoubleClick = useCallback((e: React.MouseEvent) => {
    e.stopPropagation();
    setIsEditing(true);
    setEditValue(data.label);
  }, [data.label]);

  const handleSave = useCallback(() => {
    const trimmedValue = editValue.trim();
    if (trimmedValue && trimmedValue !== data.label) {
      updateNode(id, { label: trimmedValue });
    } else {
      setEditValue(data.label); // Reset if empty or unchanged
    }
    setIsEditing(false);
  }, [editValue, data.label, id, updateNode]);

  const handleCancel = useCallback(() => {
    setEditValue(data.label);
    setIsEditing(false);
  }, [data.label]);

  const handleKeyDown = useCallback((e: React.KeyboardEvent) => {
    e.stopPropagation();
    if (e.key === 'Enter') {
      handleSave();
    } else if (e.key === 'Escape') {
      handleCancel();
    }
  }, [handleSave, handleCancel]);

  const handleBlur = useCallback(() => {
    handleSave();
  }, [handleSave]);

  return (
    <motion.div
      initial={{ scale: 0.8, opacity: 0 }}
      animate={{ scale: 1, opacity: 1 }}
      exit={{ scale: 0.8, opacity: 0 }}
      transition={{ duration: 0.2 }}
      onDoubleClick={handleDoubleClick}
      className={cn(
        'px-4 py-3 rounded-xl border-2 min-w-[180px]',
        'bg-flow-surface backdrop-blur-sm',
        'transition-all duration-200',
        selected
          ? 'border-flow-accent shadow-lg shadow-flow-accent/30 glow-accent-sm'
          : 'border-flow-border hover:border-flow-accent/50',
        isEditing && 'ring-2 ring-flow-accent ring-offset-2 ring-offset-flow-bg-dark',
        className
      )}
    >
      <Handle
        type="target"
        position={Position.Top}
        className="!w-3 !h-3 !bg-flow-accent !border-2 !border-flow-bg-dark !-top-1.5"
      />
      
      <div className="flex items-center gap-3">
        <div className={cn(
          "p-2 rounded-lg flex-shrink-0",
          selected || isEditing
            ? "bg-flow-accent/20 text-flow-accent" 
            : "bg-flow-bg-lighter text-flow-text-muted"
        )}>
          <Workflow className="w-5 h-5" />
        </div>
        
        <div className="flex flex-col gap-0.5 flex-1 min-w-0">
          {isEditing ? (
            <div className="flex items-center gap-1">
              <input
                ref={inputRef}
                type="text"
                value={editValue}
                onChange={(e) => setEditValue(e.target.value)}
                onKeyDown={handleKeyDown}
                onBlur={handleBlur}
                className={cn(
                  "w-full px-2 py-1 text-sm font-semibold rounded-md",
                  "bg-flow-bg-darker border border-flow-accent",
                  "text-flow-text placeholder:text-flow-text-muted",
                  "focus:outline-none focus:ring-1 focus:ring-flow-accent",
                  "nodrag" // Prevent dragging while editing
                )}
                placeholder="Enter label..."
              />
            </div>
          ) : (
            <span 
              className="text-sm font-semibold text-flow-text truncate cursor-text"
              title="Double-click to edit"
            >
              {data.label}
            </span>
          )}
          <span className="text-xs text-flow-text-muted">
            {isEditing ? (
              <span className="text-flow-accent">Press Enter to save, Esc to cancel</span>
            ) : (
              'Double-click to edit'
            )}
          </span>
        </div>
      </div>
      
      <Handle
        type="source"
        position={Position.Bottom}
        className="!w-3 !h-3 !bg-flow-accent !border-2 !border-flow-bg-dark !-bottom-1.5"
      />
    </motion.div>
  );
});

export default WorkflowNode;
