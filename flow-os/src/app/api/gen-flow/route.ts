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
// GET Handler - Health Check
// ============================================================================

export async function GET() {
  const apiKey = process.env.OPENAI_API_KEY;
  const isConfigured = !!apiKey && apiKey.startsWith('sk-');
  
  return NextResponse.json({
    status: 'ok',
    apiKeyConfigured: isConfigured,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 7)}...` : 'not set',
    timestamp: new Date().toISOString(),
  });
}

// ============================================================================
// POST Handler - Generate Flow
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // Parse request body
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid prompt', code: 'INVALID_PROMPT' },
        { status: 400 }
      );
    }

    // Check for API key
    const apiKey = process.env.OPENAI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { 
          error: 'OpenAI API key not configured. Please add OPENAI_API_KEY to your environment variables.', 
          code: 'API_KEY_MISSING',
          help: 'Go to Vercel Dashboard → Project Settings → Environment Variables → Add OPENAI_API_KEY'
        },
        { status: 500 }
      );
    }

    if (!apiKey.startsWith('sk-')) {
      return NextResponse.json(
        { 
          error: 'Invalid OpenAI API key format. Key should start with "sk-"', 
          code: 'API_KEY_INVALID',
          help: 'Check your API key at https://platform.openai.com/api-keys'
        },
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
        { error: 'No response from OpenAI', code: 'EMPTY_RESPONSE' },
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
        { error: 'Invalid JSON response from AI', code: 'PARSE_ERROR' },
        { status: 500 }
      );
    }

    // Validate response structure
    if (!flowData.nodes || !Array.isArray(flowData.nodes)) {
      return NextResponse.json(
        { error: 'Invalid flow structure: missing nodes', code: 'INVALID_STRUCTURE' },
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
      let errorMessage = error.message;
      let help = '';
      
      if (error.status === 401) {
        errorMessage = 'Invalid API key. Please check your OpenAI API key.';
        help = 'Get a new key at https://platform.openai.com/api-keys';
      } else if (error.status === 429) {
        errorMessage = 'Rate limit exceeded or quota exhausted.';
        help = 'Check your usage at https://platform.openai.com/usage';
      } else if (error.status === 503) {
        errorMessage = 'OpenAI service is temporarily unavailable.';
        help = 'Please try again in a few moments.';
      }
      
      return NextResponse.json(
        { 
          error: errorMessage, 
          code: `OPENAI_${error.status}`,
          help,
        },
        { status: error.status || 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate flow', code: 'UNKNOWN_ERROR' },
      { status: 500 }
    );
  }
}
