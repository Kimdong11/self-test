/**
 * Flow-OS Graph Type Definitions
 * 
 * These types define the structure for the Text-to-Graph conversion system.
 * They are compatible with React Flow's node and edge types.
 */

// ============================================================================
// Node Types
// ============================================================================

/**
 * Node type classification for workflow steps
 */
export type GraphNodeType = 'input' | 'default' | 'output';

/**
 * Position coordinates for a node on the canvas
 */
export interface NodePosition {
  x: number;
  y: number;
}

/**
 * Data payload for a node
 */
export interface GraphNodeData {
  label: string;
  description?: string;
  icon?: string;
  color?: string;
  metadata?: Record<string, unknown>;
}

/**
 * Complete node definition for the graph
 */
export interface GraphNode {
  id: string;
  type: GraphNodeType;
  position: NodePosition;
  data: GraphNodeData;
}

// ============================================================================
// Edge Types
// ============================================================================

/**
 * Edge/connection definition between nodes
 */
export interface GraphEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
  animated?: boolean;
  style?: Record<string, string | number>;
}

// ============================================================================
// Graph Structure
// ============================================================================

/**
 * Complete graph structure containing nodes and edges
 * This is the main output format from Text-to-Graph conversion
 */
export interface GraphStructure {
  nodes: GraphNode[];
  edges: GraphEdge[];
}

// ============================================================================
// Text-to-Graph Types
// ============================================================================

/**
 * Workflow step extracted from text description
 */
export interface WorkflowStep {
  id: string;
  name: string;
  description?: string;
  type: GraphNodeType;
  dependencies?: string[]; // IDs of steps this depends on
}

/**
 * Parsed workflow from text input
 */
export interface ParsedWorkflow {
  title?: string;
  description?: string;
  steps: WorkflowStep[];
}

/**
 * Options for graph layout generation
 */
export interface GraphLayoutOptions {
  direction?: 'TB' | 'LR' | 'BT' | 'RL'; // Top-Bottom, Left-Right, etc.
  nodeSpacing?: number;
  levelSpacing?: number;
  startPosition?: NodePosition;
}

/**
 * Result from Text-to-Graph conversion
 */
export interface TextToGraphResult {
  success: boolean;
  graph?: GraphStructure;
  error?: string;
  rawParsed?: ParsedWorkflow;
}

// ============================================================================
// AI Response Types
// ============================================================================

/**
 * Expected response format from OpenAI for workflow parsing
 */
export interface AIWorkflowResponse {
  workflow: {
    title: string;
    description: string;
    steps: Array<{
      id: string;
      name: string;
      description: string;
      type: 'input' | 'default' | 'output';
      dependsOn: string[];
    }>;
  };
}

// ============================================================================
// Validation Types
// ============================================================================

/**
 * Validation result for graph structure
 */
export interface GraphValidationResult {
  isValid: boolean;
  errors: string[];
  warnings: string[];
}

// ============================================================================
// Type Guards
// ============================================================================

/**
 * Type guard to check if a value is a valid GraphNodeType
 */
export function isGraphNodeType(value: unknown): value is GraphNodeType {
  return value === 'input' || value === 'default' || value === 'output';
}

/**
 * Type guard to check if an object is a valid GraphNode
 */
export function isGraphNode(obj: unknown): obj is GraphNode {
  if (typeof obj !== 'object' || obj === null) return false;
  const node = obj as Record<string, unknown>;
  return (
    typeof node.id === 'string' &&
    isGraphNodeType(node.type) &&
    typeof node.position === 'object' &&
    node.position !== null &&
    typeof (node.position as NodePosition).x === 'number' &&
    typeof (node.position as NodePosition).y === 'number' &&
    typeof node.data === 'object' &&
    node.data !== null &&
    typeof (node.data as GraphNodeData).label === 'string'
  );
}

/**
 * Type guard to check if an object is a valid GraphEdge
 */
export function isGraphEdge(obj: unknown): obj is GraphEdge {
  if (typeof obj !== 'object' || obj === null) return false;
  const edge = obj as Record<string, unknown>;
  return (
    typeof edge.id === 'string' &&
    typeof edge.source === 'string' &&
    typeof edge.target === 'string'
  );
}

/**
 * Type guard to check if an object is a valid GraphStructure
 */
export function isGraphStructure(obj: unknown): obj is GraphStructure {
  if (typeof obj !== 'object' || obj === null) return false;
  const graph = obj as Record<string, unknown>;
  return (
    Array.isArray(graph.nodes) &&
    Array.isArray(graph.edges) &&
    graph.nodes.every(isGraphNode) &&
    graph.edges.every(isGraphEdge)
  );
}
