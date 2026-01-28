/**
 * Graph Layout Utilities using Dagre
 * 
 * Provides automatic layout calculation for nodes to prevent overlapping
 * and ensure a clean, readable graph structure.
 */

import dagre from 'dagre';
import type { Node, Edge } from '@xyflow/react';

// ============================================================================
// Types
// ============================================================================

export interface LayoutOptions {
  /** Direction of the graph layout */
  direction?: 'TB' | 'BT' | 'LR' | 'RL';
  /** Horizontal space between nodes */
  nodeSep?: number;
  /** Vertical space between ranks/levels */
  rankSep?: number;
  /** Node width for layout calculation */
  nodeWidth?: number;
  /** Node height for layout calculation */
  nodeHeight?: number;
  /** Alignment of nodes within their rank */
  align?: 'UL' | 'UR' | 'DL' | 'DR';
  /** Type of ranking algorithm */
  ranker?: 'network-simplex' | 'tight-tree' | 'longest-path';
}

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_OPTIONS: Required<LayoutOptions> = {
  direction: 'TB',
  nodeSep: 80,      // Horizontal gap between nodes (increased for breathing room)
  rankSep: 120,     // Vertical gap between levels (increased for clarity)
  nodeWidth: 200,   // Estimated node width
  nodeHeight: 80,   // Estimated node height
  align: 'UL',
  ranker: 'network-simplex',
};

// ============================================================================
// Layout Functions
// ============================================================================

/**
 * Apply Dagre layout to nodes and edges
 * Returns new nodes with calculated positions
 */
export function getLayoutedElements<
  NodeType extends Node = Node,
  EdgeType extends Edge = Edge
>(
  nodes: NodeType[],
  edges: EdgeType[],
  options?: LayoutOptions
): { nodes: NodeType[]; edges: EdgeType[] } {
  const opts = { ...DEFAULT_OPTIONS, ...options };
  
  // Create a new dagre graph
  const dagreGraph = new dagre.graphlib.Graph();
  
  // Configure the graph
  dagreGraph.setDefaultEdgeLabel(() => ({}));
  dagreGraph.setGraph({
    rankdir: opts.direction,
    nodesep: opts.nodeSep,
    ranksep: opts.rankSep,
    align: opts.align,
    ranker: opts.ranker,
  });

  // Add nodes to the dagre graph
  nodes.forEach((node) => {
    dagreGraph.setNode(node.id, {
      width: opts.nodeWidth,
      height: opts.nodeHeight,
    });
  });

  // Add edges to the dagre graph
  edges.forEach((edge) => {
    dagreGraph.setEdge(edge.source, edge.target);
  });

  // Calculate the layout
  dagre.layout(dagreGraph);

  // Apply calculated positions to nodes
  const layoutedNodes = nodes.map((node) => {
    const nodeWithPosition = dagreGraph.node(node.id);
    
    if (!nodeWithPosition) {
      return node;
    }

    // Dagre returns center coordinates, we need top-left for React Flow
    const newNode = {
      ...node,
      position: {
        x: nodeWithPosition.x - opts.nodeWidth / 2,
        y: nodeWithPosition.y - opts.nodeHeight / 2,
      },
    };

    return newNode;
  });

  return { nodes: layoutedNodes, edges };
}

/**
 * Check if nodes need re-layout (e.g., overlapping detection)
 */
export function needsLayout<NodeType extends Node = Node>(
  nodes: NodeType[],
  threshold: number = 50
): boolean {
  if (nodes.length <= 1) return false;

  // Check for overlapping nodes
  for (let i = 0; i < nodes.length; i++) {
    for (let j = i + 1; j < nodes.length; j++) {
      const dx = Math.abs(nodes[i].position.x - nodes[j].position.x);
      const dy = Math.abs(nodes[i].position.y - nodes[j].position.y);
      
      if (dx < threshold && dy < threshold) {
        return true;
      }
    }
  }

  return false;
}

/**
 * Get bounds of all nodes for viewport calculation
 */
export function getNodesBounds<NodeType extends Node = Node>(
  nodes: NodeType[],
  padding: number = 50
): { x: number; y: number; width: number; height: number } | null {
  if (nodes.length === 0) return null;

  let minX = Infinity;
  let minY = Infinity;
  let maxX = -Infinity;
  let maxY = -Infinity;

  nodes.forEach((node) => {
    minX = Math.min(minX, node.position.x);
    minY = Math.min(minY, node.position.y);
    maxX = Math.max(maxX, node.position.x + DEFAULT_OPTIONS.nodeWidth);
    maxY = Math.max(maxY, node.position.y + DEFAULT_OPTIONS.nodeHeight);
  });

  return {
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  };
}

/**
 * Calculate optimal starting position for new nodes
 */
export function getNewNodePosition<NodeType extends Node = Node>(
  existingNodes: NodeType[],
  options?: LayoutOptions
): { x: number; y: number } {
  const opts = { ...DEFAULT_OPTIONS, ...options };

  if (existingNodes.length === 0) {
    return { x: 250, y: 100 };
  }

  // Find the bottom-most node and position below it
  let maxY = -Infinity;
  let avgX = 0;

  existingNodes.forEach((node) => {
    maxY = Math.max(maxY, node.position.y);
    avgX += node.position.x;
  });

  avgX /= existingNodes.length;

  return {
    x: avgX,
    y: maxY + opts.nodeHeight + opts.rankSep,
  };
}
