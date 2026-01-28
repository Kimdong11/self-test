/**
 * Text-to-Graph Conversion Utility
 * 
 * Converts parsed workflow descriptions into React Flow compatible graph structures.
 */

import {
  GraphStructure,
  GraphNode,
  GraphEdge,
  GraphNodeType,
  ParsedWorkflow,
  WorkflowStep,
  GraphLayoutOptions,
  TextToGraphResult,
  GraphValidationResult,
  NodePosition,
} from '../types/graph';

// ============================================================================
// Default Configuration
// ============================================================================

const DEFAULT_LAYOUT_OPTIONS: Required<GraphLayoutOptions> = {
  direction: 'TB',
  nodeSpacing: 200,
  levelSpacing: 150,
  startPosition: { x: 250, y: 50 },
};

// ============================================================================
// Layout Calculation
// ============================================================================

/**
 * Calculate node positions based on dependencies and layout options
 */
function calculateNodePositions(
  steps: WorkflowStep[],
  options: Required<GraphLayoutOptions>
): Map<string, NodePosition> {
  const positions = new Map<string, NodePosition>();
  const levels = new Map<string, number>();
  
  // Build dependency graph and calculate levels (topological sort)
  const visited = new Set<string>();
  const stepMap = new Map(steps.map(s => [s.id, s]));
  
  function getLevel(stepId: string): number {
    if (levels.has(stepId)) {
      return levels.get(stepId)!;
    }
    
    const step = stepMap.get(stepId);
    if (!step || !step.dependencies || step.dependencies.length === 0) {
      levels.set(stepId, 0);
      return 0;
    }
    
    const maxDependencyLevel = Math.max(
      ...step.dependencies
        .filter(depId => stepMap.has(depId))
        .map(depId => getLevel(depId))
    );
    
    const level = maxDependencyLevel + 1;
    levels.set(stepId, level);
    return level;
  }
  
  // Calculate levels for all steps
  steps.forEach(step => getLevel(step.id));
  
  // Group steps by level
  const levelGroups = new Map<number, WorkflowStep[]>();
  steps.forEach(step => {
    const level = levels.get(step.id) || 0;
    if (!levelGroups.has(level)) {
      levelGroups.set(level, []);
    }
    levelGroups.get(level)!.push(step);
  });
  
  // Calculate positions based on layout direction
  const isHorizontal = options.direction === 'LR' || options.direction === 'RL';
  const isReversed = options.direction === 'BT' || options.direction === 'RL';
  
  levelGroups.forEach((levelSteps, level) => {
    const adjustedLevel = isReversed ? (levelGroups.size - 1 - level) : level;
    
    levelSteps.forEach((step, index) => {
      const offset = (index - (levelSteps.length - 1) / 2) * options.nodeSpacing;
      
      let x: number, y: number;
      
      if (isHorizontal) {
        x = options.startPosition.x + adjustedLevel * options.levelSpacing;
        y = options.startPosition.y + offset;
      } else {
        x = options.startPosition.x + offset;
        y = options.startPosition.y + adjustedLevel * options.levelSpacing;
      }
      
      positions.set(step.id, { x, y });
    });
  });
  
  return positions;
}

// ============================================================================
// Graph Generation
// ============================================================================

/**
 * Convert a WorkflowStep to a GraphNode
 */
function stepToNode(
  step: WorkflowStep,
  position: NodePosition
): GraphNode {
  return {
    id: step.id,
    type: step.type,
    position,
    data: {
      label: step.name,
      description: step.description,
    },
  };
}

/**
 * Generate edges from workflow step dependencies
 */
function generateEdges(steps: WorkflowStep[]): GraphEdge[] {
  const edges: GraphEdge[] = [];
  let edgeIndex = 0;
  
  steps.forEach(step => {
    if (step.dependencies) {
      step.dependencies.forEach(sourceId => {
        edges.push({
          id: `edge-${edgeIndex++}`,
          source: sourceId,
          target: step.id,
          animated: true,
        });
      });
    }
  });
  
  return edges;
}

/**
 * Convert a ParsedWorkflow to a GraphStructure
 */
export function workflowToGraph(
  workflow: ParsedWorkflow,
  options?: GraphLayoutOptions
): GraphStructure {
  const layoutOptions = { ...DEFAULT_LAYOUT_OPTIONS, ...options };
  
  // Calculate positions for all nodes
  const positions = calculateNodePositions(workflow.steps, layoutOptions);
  
  // Convert steps to nodes
  const nodes: GraphNode[] = workflow.steps.map(step => 
    stepToNode(step, positions.get(step.id) || layoutOptions.startPosition)
  );
  
  // Generate edges from dependencies
  const edges = generateEdges(workflow.steps);
  
  return { nodes, edges };
}

// ============================================================================
// Text Parsing (Simple Rules-Based)
// ============================================================================

/**
 * Simple keyword-based step type detection
 */
function detectStepType(name: string, index: number, total: number): GraphNodeType {
  const lowerName = name.toLowerCase();
  
  // Input indicators
  if (
    lowerName.includes('start') ||
    lowerName.includes('input') ||
    lowerName.includes('receive') ||
    lowerName.includes('trigger') ||
    lowerName.includes('begin') ||
    index === 0
  ) {
    return 'input';
  }
  
  // Output indicators
  if (
    lowerName.includes('end') ||
    lowerName.includes('output') ||
    lowerName.includes('finish') ||
    lowerName.includes('complete') ||
    lowerName.includes('send') ||
    lowerName.includes('deliver') ||
    lowerName.includes('return') ||
    index === total - 1
  ) {
    return 'output';
  }
  
  return 'default';
}

/**
 * Parse a simple text description into workflow steps
 * Supports formats like:
 * - "Step 1, Step 2, Step 3"
 * - "Step 1 -> Step 2 -> Step 3"
 * - "1. Step 1\n2. Step 2\n3. Step 3"
 */
export function parseSimpleText(text: string): ParsedWorkflow {
  const steps: WorkflowStep[] = [];
  
  // Clean the text
  let cleanText = text.trim();
  
  // Detect format and split
  let parts: string[];
  
  if (cleanText.includes('->')) {
    // Arrow format: "A -> B -> C"
    parts = cleanText.split('->').map(s => s.trim()).filter(Boolean);
  } else if (cleanText.includes('\n')) {
    // Newline format with optional numbering
    parts = cleanText
      .split('\n')
      .map(line => line.replace(/^\d+[\.\)]\s*/, '').trim())
      .filter(Boolean);
  } else if (cleanText.includes(',')) {
    // Comma-separated format
    parts = cleanText.split(',').map(s => s.trim()).filter(Boolean);
  } else if (cleanText.includes(' then ')) {
    // Natural language "then" format
    parts = cleanText.split(/\s+then\s+/i).map(s => s.trim()).filter(Boolean);
  } else {
    // Single step or sentence - try to split by common patterns
    parts = [cleanText];
  }
  
  // Convert parts to workflow steps
  parts.forEach((part, index) => {
    const id = `step-${index + 1}`;
    const type = detectStepType(part, index, parts.length);
    
    steps.push({
      id,
      name: part,
      type,
      dependencies: index > 0 ? [`step-${index}`] : undefined,
    });
  });
  
  return { steps };
}

// ============================================================================
// Main Conversion Function
// ============================================================================

/**
 * Convert text description to graph structure
 * This is the main entry point for simple text-to-graph conversion
 */
export function textToGraph(
  text: string,
  options?: GraphLayoutOptions
): TextToGraphResult {
  try {
    if (!text || text.trim().length === 0) {
      return {
        success: false,
        error: 'Empty text input',
      };
    }
    
    // Parse the text into workflow steps
    const parsedWorkflow = parseSimpleText(text);
    
    if (parsedWorkflow.steps.length === 0) {
      return {
        success: false,
        error: 'Could not parse any workflow steps from the text',
      };
    }
    
    // Convert to graph structure
    const graph = workflowToGraph(parsedWorkflow, options);
    
    // Validate the generated graph
    const validation = validateGraph(graph);
    if (!validation.isValid) {
      return {
        success: false,
        error: validation.errors.join('; '),
        rawParsed: parsedWorkflow,
      };
    }
    
    return {
      success: true,
      graph,
      rawParsed: parsedWorkflow,
    };
  } catch (error) {
    return {
      success: false,
      error: error instanceof Error ? error.message : 'Unknown error during conversion',
    };
  }
}

// ============================================================================
// Validation
// ============================================================================

/**
 * Validate a graph structure for correctness
 */
export function validateGraph(graph: GraphStructure): GraphValidationResult {
  const errors: string[] = [];
  const warnings: string[] = [];
  
  // Check for empty graph
  if (graph.nodes.length === 0) {
    errors.push('Graph has no nodes');
  }
  
  // Collect all node IDs
  const nodeIds = new Set(graph.nodes.map(n => n.id));
  
  // Check for duplicate node IDs
  if (nodeIds.size !== graph.nodes.length) {
    errors.push('Graph contains duplicate node IDs');
  }
  
  // Validate edges reference existing nodes
  graph.edges.forEach(edge => {
    if (!nodeIds.has(edge.source)) {
      errors.push(`Edge "${edge.id}" references non-existent source node "${edge.source}"`);
    }
    if (!nodeIds.has(edge.target)) {
      errors.push(`Edge "${edge.id}" references non-existent target node "${edge.target}"`);
    }
    if (edge.source === edge.target) {
      warnings.push(`Edge "${edge.id}" is a self-loop`);
    }
  });
  
  // Check for duplicate edges
  const edgeKeys = new Set<string>();
  graph.edges.forEach(edge => {
    const key = `${edge.source}->${edge.target}`;
    if (edgeKeys.has(key)) {
      warnings.push(`Duplicate edge from "${edge.source}" to "${edge.target}"`);
    }
    edgeKeys.add(key);
  });
  
  // Check for disconnected nodes (warning, not error)
  const connectedNodes = new Set<string>();
  graph.edges.forEach(edge => {
    connectedNodes.add(edge.source);
    connectedNodes.add(edge.target);
  });
  
  graph.nodes.forEach(node => {
    if (!connectedNodes.has(node.id) && graph.nodes.length > 1) {
      warnings.push(`Node "${node.id}" is not connected to any other node`);
    }
  });
  
  return {
    isValid: errors.length === 0,
    errors,
    warnings,
  };
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Generate a unique ID for a node
 */
export function generateNodeId(): string {
  return `node-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Generate a unique ID for an edge
 */
export function generateEdgeId(): string {
  return `edge-${Date.now()}-${Math.random().toString(36).substr(2, 9)}`;
}

/**
 * Create an empty graph structure
 */
export function createEmptyGraph(): GraphStructure {
  return { nodes: [], edges: [] };
}

/**
 * Merge two graph structures
 */
export function mergeGraphs(
  graph1: GraphStructure,
  graph2: GraphStructure,
  offset?: NodePosition
): GraphStructure {
  const offsetX = offset?.x || 0;
  const offsetY = offset?.y || 0;
  
  const offsetNodes = graph2.nodes.map(node => ({
    ...node,
    position: {
      x: node.position.x + offsetX,
      y: node.position.y + offsetY,
    },
  }));
  
  return {
    nodes: [...graph1.nodes, ...offsetNodes],
    edges: [...graph1.edges, ...graph2.edges],
  };
}
