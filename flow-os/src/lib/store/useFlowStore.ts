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
import { textToGraph, getLayoutedElements, getNewNodePosition } from '../graph';
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

// API Response types
export interface APIFlowNode {
  id: string;
  type: 'default' | 'input' | 'output' | 'decision';
  position: { x: number; y: number };
  data: { label: string };
}

export interface APIFlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

export interface APIFlowResponse {
  nodes: APIFlowNode[];
  edges: APIFlowEdge[];
}

interface FlowState {
  // State
  nodes: FlowNode[];
  edges: FlowEdge[];
  selectedNode: FlowNode | null;
  isProcessing: boolean;
  lastConversionResult: TextToGraphResult | null;
  shouldFitView: boolean; // Flag to trigger fitView in canvas
  lastError: string | null;
  
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
  
  // API Actions
  loadFromAPIResponse: (response: APIFlowResponse) => void;
  setError: (error: string | null) => void;
  
  // Layout Actions
  applyLayout: () => void;
  setShouldFitView: (should: boolean) => void;
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
 * Convert API response to FlowNode/FlowEdge format
 */
function apiResponseToFlowFormat(response: APIFlowResponse): { nodes: FlowNode[]; edges: FlowEdge[] } {
  const nodes: FlowNode[] = response.nodes.map(node => ({
    id: node.id,
    type: 'workflow', // Use our custom workflow node type
    position: node.position,
    data: {
      label: node.data.label,
      type: node.type, // Store the API node type in data
    },
  }));

  const edges: FlowEdge[] = response.edges.map(edge => ({
    id: edge.id,
    source: edge.source,
    target: edge.target,
    label: edge.label,
    animated: true,
    style: { stroke: '#00F0FF', strokeWidth: 2 },
  }));

  return { nodes, edges };
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
      shouldFitView: false,
      lastError: null,

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
        const existingNodes = get().nodes;
        const position = getNewNodePosition(existingNodes);
        
        set({
          nodes: [...existingNodes, { ...node, position }],
          shouldFitView: true,
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
        shouldFitView: false,
      }),

      // Text-to-Graph Actions
      loadFromText: (text, options) => {
        const result = textToGraph(text, options);
        
        set({ lastConversionResult: result });
        
        if (result.success && result.graph) {
          const { nodes, edges } = graphToFlowFormat(result.graph);
          
          // Apply dagre layout for optimal positioning
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            nodes,
            edges,
            {
              direction: 'TB',
              nodeSep: 80,   // Horizontal gap
              rankSep: 120,  // Vertical gap
            }
          );
          
          set({ 
            nodes: layoutedNodes, 
            edges: layoutedEdges, 
            selectedNode: null,
            shouldFitView: true, // Trigger fitView after loading
          });
        }
        
        return result;
      },

      loadFromGraph: (graph) => {
        const { nodes, edges } = graphToFlowFormat(graph);
        
        // Apply dagre layout
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          nodes,
          edges,
          {
            direction: 'TB',
            nodeSep: 80,
            rankSep: 120,
          }
        );
        
        set({ 
          nodes: layoutedNodes, 
          edges: layoutedEdges, 
          selectedNode: null,
          shouldFitView: true,
        });
      },

      appendFromText: (text, options) => {
        const existingNodes = get().nodes;
        const existingEdges = get().edges;
        
        const result = textToGraph(text, options);
        
        set({ lastConversionResult: result });
        
        if (result.success && result.graph) {
          const { nodes: newNodes, edges: newEdges } = graphToFlowFormat(result.graph);
          
          // Combine all nodes and edges
          let allNodes = [...existingNodes, ...newNodes];
          let allEdges = [...existingEdges, ...newEdges];
          
          // Connect last existing node to first new node if both exist
          if (existingNodes.length > 0 && newNodes.length > 0) {
            const lastExisting = existingNodes[existingNodes.length - 1];
            const firstNew = newNodes[0];
            allEdges.push({
              id: `edge-connect-${Date.now()}`,
              source: lastExisting.id,
              target: firstNew.id,
              animated: true,
              style: { stroke: '#00F0FF', strokeWidth: 2 },
            });
          }
          
          // Apply dagre layout to entire graph
          const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
            allNodes,
            allEdges,
            {
              direction: 'TB',
              nodeSep: 80,
              rankSep: 120,
            }
          );
          
          set({
            nodes: layoutedNodes,
            edges: layoutedEdges,
            shouldFitView: true,
          });
        }
        
        return result;
      },

      setProcessing: (processing) => set({ isProcessing: processing }),

      // Layout Actions
      applyLayout: () => {
        const { nodes, edges } = get();
        
        if (nodes.length === 0) return;
        
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          nodes,
          edges,
          {
            direction: 'TB',
            nodeSep: 80,
            rankSep: 120,
          }
        );
        
        set({ 
          nodes: layoutedNodes, 
          edges: layoutedEdges,
          shouldFitView: true,
        });
      },

      setShouldFitView: (should) => set({ shouldFitView: should }),

      // API Actions
      loadFromAPIResponse: (response) => {
        const { nodes, edges } = apiResponseToFlowFormat(response);
        
        // Apply dagre layout for optimal positioning
        const { nodes: layoutedNodes, edges: layoutedEdges } = getLayoutedElements(
          nodes,
          edges,
          {
            direction: 'TB',
            nodeSep: 80,
            rankSep: 120,
          }
        );
        
        set({
          nodes: layoutedNodes,
          edges: layoutedEdges,
          selectedNode: null,
          shouldFitView: true,
          lastError: null,
        });
      },

      setError: (error) => set({ lastError: error }),
    }),
    { name: 'flow-store' }
  )
);
