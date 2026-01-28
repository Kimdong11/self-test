import { create } from 'zustand';
import { devtools } from 'zustand/middleware';
import {
  Node,
  Edge,
  NodeChange,
  EdgeChange,
  Connection,
  applyNodeChanges,
  applyEdgeChanges,
  addEdge,
} from '@xyflow/react';

export type NodeData = {
  label: string;
  type?: string;
  [key: string]: unknown;
};

export type FlowNode = Node<NodeData>;
export type FlowEdge = Edge;

interface FlowState {
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNode: FlowNode | null;
  
  // Actions
  setNodes: (nodes: FlowNode[]) => void;
  setEdges: (edges: FlowEdge[]) => void;
  onNodesChange: (changes: NodeChange<FlowNode>[]) => void;
  onEdgesChange: (changes: EdgeChange<FlowEdge>[]) => void;
  onConnect: (connection: Connection) => void;
  addNode: (node: FlowNode) => void;
  updateNode: (nodeId: string, data: Partial<NodeData>) => void;
  deleteNode: (nodeId: string) => void;
  setSelectedNode: (node: FlowNode | null) => void;
  clearFlow: () => void;
}

const initialNodes: FlowNode[] = [
  {
    id: '1',
    type: 'workflow',
    position: { x: 250, y: 100 },
    data: { label: 'Start Node' },
  },
];

const initialEdges: FlowEdge[] = [];

export const useFlowStore = create<FlowState>()(
  devtools(
    (set, get) => ({
      nodes: initialNodes,
      edges: initialEdges,
      selectedNode: null,

      setNodes: (nodes) => set({ nodes }),
      
      setEdges: (edges) => set({ edges }),
      
      onNodesChange: (changes) => {
        set({
          nodes: applyNodeChanges(changes, get().nodes),
        });
      },
      
      onEdgesChange: (changes) => {
        set({
          edges: applyEdgeChanges(changes, get().edges),
        });
      },
      
      onConnect: (connection) => {
        set({
          edges: addEdge(connection, get().edges),
        });
      },
      
      addNode: (node) => {
        set({
          nodes: [...get().nodes, node],
        });
      },
      
      updateNode: (nodeId, data) => {
        set({
          nodes: get().nodes.map((node) =>
            node.id === nodeId
              ? { ...node, data: { ...node.data, ...data } }
              : node
          ),
        });
      },
      
      deleteNode: (nodeId) => {
        set({
          nodes: get().nodes.filter((node) => node.id !== nodeId),
          edges: get().edges.filter(
            (edge) => edge.source !== nodeId && edge.target !== nodeId
          ),
        });
      },
      
      setSelectedNode: (node) => set({ selectedNode: node }),
      
      clearFlow: () => set({ nodes: [], edges: [], selectedNode: null }),
    }),
    { name: 'flow-store' }
  )
);
