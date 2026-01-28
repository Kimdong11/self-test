/**
 * Text-to-Graph Test Suite
 * 
 * Run with: npx tsx src/lib/graph/__tests__/text-to-graph.test.ts
 */

import {
  textToGraph,
  parseSimpleText,
  validateGraph,
} from '../text-to-graph';

// ============================================================================
// Test Helpers
// ============================================================================

let passCount = 0;
let failCount = 0;

function test(name: string, fn: () => void) {
  try {
    fn();
    console.log(`✅ ${name}`);
    passCount++;
  } catch (error) {
    console.log(`❌ ${name}`);
    console.log(`   Error: ${error instanceof Error ? error.message : error}`);
    failCount++;
  }
}

function expect<T>(actual: T) {
  return {
    toBe(expected: T) {
      if (actual !== expected) {
        throw new Error(`Expected ${expected}, got ${actual}`);
      }
    },
    toEqual(expected: T) {
      if (JSON.stringify(actual) !== JSON.stringify(expected)) {
        throw new Error(`Expected ${JSON.stringify(expected)}, got ${JSON.stringify(actual)}`);
      }
    },
    toBeTruthy() {
      if (!actual) {
        throw new Error(`Expected truthy value, got ${actual}`);
      }
    },
    toBeFalsy() {
      if (actual) {
        throw new Error(`Expected falsy value, got ${actual}`);
      }
    },
    toBeGreaterThan(expected: number) {
      if (typeof actual !== 'number' || actual <= expected) {
        throw new Error(`Expected ${actual} to be greater than ${expected}`);
      }
    },
    toHaveLength(expected: number) {
      if (!Array.isArray(actual) || actual.length !== expected) {
        throw new Error(`Expected length ${expected}, got ${Array.isArray(actual) ? actual.length : 'not an array'}`);
      }
    },
  };
}

// ============================================================================
// Tests
// ============================================================================

console.log('\n🧪 Text-to-Graph Test Suite\n');
console.log('=' .repeat(50));

// Test 1: Arrow format parsing
test('Arrow format: "A -> B -> C"', () => {
  const result = textToGraph('Start -> Process -> End');
  expect(result.success).toBeTruthy();
  expect(result.graph?.nodes).toHaveLength(3);
  expect(result.graph?.edges).toHaveLength(2);
  expect(result.graph?.nodes[0].data.label).toBe('Start');
  expect(result.graph?.nodes[0].type).toBe('input');
  expect(result.graph?.nodes[2].type).toBe('output');
});

// Test 2: Comma format parsing
test('Comma format: "A, B, C"', () => {
  const result = textToGraph('Input Data, Process Data, Output Results');
  expect(result.success).toBeTruthy();
  expect(result.graph?.nodes).toHaveLength(3);
  expect(result.graph?.edges).toHaveLength(2);
});

// Test 3: Newline format parsing
test('Newline format with numbers', () => {
  const result = textToGraph(`1. Receive Order
2. Validate Payment
3. Process Order
4. Ship Package`);
  expect(result.success).toBeTruthy();
  expect(result.graph?.nodes).toHaveLength(4);
  expect(result.graph?.edges).toHaveLength(3);
});

// Test 4: Natural language "then" format
test('Natural language: "A then B then C"', () => {
  const result = textToGraph('Get user input then validate data then save to database');
  expect(result.success).toBeTruthy();
  expect(result.graph?.nodes).toHaveLength(3);
});

// Test 5: Step type detection
test('Step type detection (input/default/output)', () => {
  const result = textToGraph('Start process -> Handle data -> Complete task');
  expect(result.success).toBeTruthy();
  expect(result.graph?.nodes[0].type).toBe('input'); // "Start" keyword
  expect(result.graph?.nodes[1].type).toBe('default');
  expect(result.graph?.nodes[2].type).toBe('output'); // "Complete" keyword
});

// Test 6: Empty input handling
test('Empty input returns error', () => {
  const result = textToGraph('');
  expect(result.success).toBeFalsy();
  expect(result.error).toBeTruthy();
});

// Test 7: Single step
test('Single step workflow', () => {
  const result = textToGraph('Process Data');
  expect(result.success).toBeTruthy();
  expect(result.graph?.nodes).toHaveLength(1);
  expect(result.graph?.edges).toHaveLength(0);
});

// Test 8: Node positions are calculated
test('Node positions are calculated correctly', () => {
  const result = textToGraph('A -> B -> C');
  expect(result.success).toBeTruthy();
  
  const positions = result.graph?.nodes.map(n => n.position);
  expect(positions?.[0].x).toBeGreaterThan(0);
  expect(positions?.[0].y).toBeGreaterThan(0);
  
  // Nodes should be arranged vertically (default TB direction)
  if (positions && positions.length >= 2) {
    expect(positions[1].y).toBeGreaterThan(positions[0].y);
  }
});

// Test 9: Edge connections are correct
test('Edge connections link nodes correctly', () => {
  const result = textToGraph('First -> Second -> Third');
  expect(result.success).toBeTruthy();
  
  const edges = result.graph?.edges;
  expect(edges?.[0].source).toBe('step-1');
  expect(edges?.[0].target).toBe('step-2');
  expect(edges?.[1].source).toBe('step-2');
  expect(edges?.[1].target).toBe('step-3');
});

// Test 10: Graph validation
test('Graph validation detects issues', () => {
  const invalidGraph = {
    nodes: [
      { id: 'n1', type: 'default' as const, position: { x: 0, y: 0 }, data: { label: 'Test' } }
    ],
    edges: [
      { id: 'e1', source: 'n1', target: 'nonexistent' } // Invalid target
    ]
  };
  
  const validation = validateGraph(invalidGraph);
  expect(validation.isValid).toBeFalsy();
  expect(validation.errors.length).toBeGreaterThan(0);
});

// Test 11: Complex workflow
test('Complex workflow with 5+ steps', () => {
  const result = textToGraph(`
    Receive Request ->
    Authenticate User ->
    Validate Input ->
    Process Data ->
    Save to Database ->
    Send Response
  `);
  expect(result.success).toBeTruthy();
  expect(result.graph?.nodes).toHaveLength(6);
  expect(result.graph?.edges).toHaveLength(5);
});

// Test 12: parseSimpleText function directly
test('parseSimpleText returns correct WorkflowStep structure', () => {
  const workflow = parseSimpleText('A -> B -> C');
  expect(workflow.steps).toHaveLength(3);
  expect(workflow.steps[0].id).toBe('step-1');
  expect(workflow.steps[0].name).toBe('A');
  expect(workflow.steps[1].dependencies).toEqual(['step-1']);
});

// ============================================================================
// Summary
// ============================================================================

console.log('\n' + '=' .repeat(50));
console.log(`\n📊 Results: ${passCount} passed, ${failCount} failed\n`);

if (failCount > 0) {
  process.exit(1);
}
