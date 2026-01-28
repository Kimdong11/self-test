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
import { textToGraph } from '../graph';
import type { GraphStructure, GraphLayoutOptions, TextToGraphResult } from '../types';

// ============================================================================
// Types
// ============================================================================

export type NodeData = {
  label: string;
  description?: string;
  type?: string;
  [key: string]: unknown;
};

export type FlowNode = Node<NodeData>;
export type FlowEdge = Edge;

interface FlowState {
  // State
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNode: FlowNode | null;
  isProcessing: boolean;
  lastConversionResult: TextToGraphResult | null;
  
  // Node/Edge Actions
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
  
  // Text-to-Graph Actions
  loadFromText: (text: string, options?: GraphLayoutOptions) => TextToGraphResult;
  loadFromGraph: (graph: GraphStructure) => void;
  appendFromText: (text: string, options?: GraphLayoutOptions) => TextToGraphResult;
  setProcessing: (processing: boolean) => void;
}

// ============================================================================
// Helpers
// ============================================================================

/**
 * Convert GraphStructure to FlowNode/FlowEdge format
 */
function graphToFlowFormat(graph: GraphStructure): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = graph.nodes.map(node => ({
    id: node.id,
    type: 'workflow', // Use our custom workflow node type
    position: node.position,
    data: {
      label: node.data.label,
      description: node.data.description,
      type: node.type, // Store the graph node type in data
    },
  }));

  const edges: FlowEdge[] = graph.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: edge.animated ?? true,
    style: { stroke: '#00F0FF', strokeWidth: 2 },
  }));

  return { nodes, edges };
}

/**
 * Calculate offset position for appending new nodes
 */
function calculateAppendOffset(existingNodes: FlowNode[]): { x: number; y: number } {
  if (existingNodes.length === 0) {
    return { x: 250, y: 50 };
  }

  const maxY = Math.max(...existingNodes.map(n => n.position.y));
  const avgX = existingNodes.reduce((sum, n) => sum + n.position.x, 0) / existingNodes.length;

  return { x: avgX, y: maxY + 200 };
}

// ============================================================================
// Initial State
// ============================================================================

const initialNodes: FlowNode[] = [];
const initialEdges: FlowEdge[] = [];

// ============================================================================
// Store
// ============================================================================

export const useFlowStore = create<FlowState>()(
  devtools(
    (set, get) => ({
      // Initial State
      nodes: initialNodes,
      edges: initialEdges,
      selectedNode: null,
      isProcessing: false,
      lastConversionResult: null,

      // Node/Edge Actions
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
          edges: addEdge(
            {
              ...connection,
              animated: true,
              style: { stroke: '#00F0FF', strokeWidth: 2 },
            },
            get().edges
          ),
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
          selectedNode: get().selectedNode?.id === nodeId ? null : get().selectedNode,
        });
      },
      
      setSelectedNode: (node) => set({ selectedNode: node }),
      
      clearFlow: () => set({ 
        nodes: [], 
        edges: [], 
        selectedNode: null,
        lastConversionResult: null,
      }),

      // Text-to-Graph Actions
      loadFromText: (text, options) => {
        const result = textToGraph(text, options);
        
        set({ lastConversionResult: result });
        
        if (result.success && result.graph) {
          const { nodes, edges } = graphToFlowFormat(result.graph);
          set({ nodes, edges, selectedNode: null });
        }
        
        return result;
      },

      loadFromGraph: (graph) => {
        const { nodes, edges } = graphToFlowFormat(graph);
        set({ nodes, edges, selectedNode: null });
      },

      appendFromText: (text, options) => {
        const existingNodes = get().nodes;
        const offset = calculateAppendOffset(existingNodes);
        
        const result = textToGraph(text, {
          ...options,
          startPosition: offset,
        });
        
        set({ lastConversionResult: result });
        
        if (result.success && result.graph) {
          const { nodes: newNodes, edges: newEdges } = graphToFlowFormat(result.graph);
          
          // Connect last existing node to first new node if both exist
          let connectingEdge: FlowEdge[] = [];
          if (existingNodes.length > 0 && newNodes.length > 0) {
            const lastExisting = existingNodes[existingNodes.length - 1];
            const firstNew = newNodes[0];
            connectingEdge = [{
              id: `edge-connect-${Date.now()}`,
              source: lastExisting.id,
              target: firstNew.id,
              animated: true,
              style: { stroke: '#00F0FF', strokeWidth: 2 },
            }];
          }
          
          set({
            nodes: [...existingNodes, ...newNodes],
            edges: [...get().edges, ...connectingEdge, ...newEdges],
          });
        }
        
        return result;
      },

      setProcessing: (processing) => set({ isProcessing: processing }),
    }),
    { name: 'flow-store' }
  )
);
