import { BaseNode } from './BaseNode';
import { WorkflowNode } from './WorkflowNode';
import { FlowCanvas } from './FlowCanvas';

export { BaseNode, WorkflowNode, FlowCanvas };

// Node types mapping for ReactFlow
export const nodeTypes = {
  base: BaseNode,
  workflow: WorkflowNode,
} as const;
