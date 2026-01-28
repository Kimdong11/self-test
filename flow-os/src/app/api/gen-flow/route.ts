import { NextRequest, NextResponse } from 'next/server';
import OpenAI from 'openai';

// ============================================================================
// Types
// ============================================================================

interface FlowNode {
  id: string;
  type: 'default' | 'input' | 'output' | 'decision';
  position: { x: number; y: number };
  data: { label: string };
}

interface FlowEdge {
  id: string;
  source: string;
  target: string;
  label?: string;
}

interface GeneratedFlow {
  nodes: FlowNode[];
  edges: FlowEdge[];
}

// ============================================================================
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a workflow generator. You MUST return ONLY a JSON object. No markdown, no explanations, no code blocks.

The JSON schema is:
{
  "nodes": [{ "id": "string", "type": "default"|"input"|"output"|"decision", "position": { "x": number, "y": number }, "data": { "label": "string" } }],
  "edges": [{ "id": "string", "source": "string", "target": "string", "label?": "string" }]
}

Rules:
1. Use "input" type for starting nodes (triggers, inputs, start points)
2. Use "output" type for ending nodes (results, outputs, end points)
3. Use "decision" type for conditional/branching nodes (if/else, switches)
4. Use "default" type for all other processing steps
5. Generate unique IDs like "node-1", "node-2", etc.
6. Generate edge IDs like "edge-1", "edge-2", etc.
7. Set positions to { "x": 0, "y": 0 } - we will auto-layout on the client
8. Create logical connections between nodes based on the workflow description
9. Keep labels concise but descriptive

Based on the user's request, generate a logical flowchart representing their workflow.`;

// ============================================================================
// API Handler
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid prompt' },
        { status: 400 }
      );
    }

    // Check for API key
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      return NextResponse.json(
        { error: 'OpenAI API key not configured' },
        { status: 500 }
      );
    }

    // Initialize OpenAI client
    const openai = new OpenAI({
      apiKey,
    });

    // Call OpenAI API
    const completion = await openai.chat.completions.create({
      model: 'gpt-4o-mini',
      messages: [
        {
          role: 'system',
          content: SYSTEM_PROMPT,
        },
        {
          role: 'user',
          content: `Generate a workflow for: ${prompt}`,
        },
      ],
      temperature: 0.7,
      max_tokens: 2000,
      response_format: { type: 'json_object' },
    });

    // Extract response content
    const content = completion.choices[0]?.message?.content;

    if (!content) {
      return NextResponse.json(
        { error: 'No response from OpenAI' },
        { status: 500 }
      );
    }

    // Parse JSON response
    let flowData: GeneratedFlow;
    try {
      flowData = JSON.parse(content);
    } catch (parseError) {
      console.error('Failed to parse OpenAI response:', content);
      return NextResponse.json(
        { error: 'Invalid JSON response from AI' },
        { status: 500 }
      );
    }

    // Validate response structure
    if (!flowData.nodes || !Array.isArray(flowData.nodes)) {
      return NextResponse.json(
        { error: 'Invalid flow structure: missing nodes' },
        { status: 500 }
      );
    }

    if (!flowData.edges || !Array.isArray(flowData.edges)) {
      // Edges are optional, default to empty array
      flowData.edges = [];
    }

    // Return the flow data
    return NextResponse.json({
      success: true,
      data: flowData,
    });

  } catch (error) {
    console.error('Error generating flow:', error);
    
    // Handle specific OpenAI errors
    if (error instanceof OpenAI.APIError) {
      return NextResponse.json(
        { error: `OpenAI API error: ${error.message}` },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate flow' },
      { status: 500 }
    );
  }
}
