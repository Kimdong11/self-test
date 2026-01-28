import { NextRequest, NextResponse } from 'next/server';
import { GoogleGenerativeAI } from '@google/generative-ai';

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
// Prompt Template
// ============================================================================

const PROMPT_TEMPLATE = `You are a professional workflow architect. Create a node-based workflow for React Flow.

IMPORTANT: Return ONLY a valid JSON object. No markdown, no code blocks, no explanations.

JSON Schema:
{
  "nodes": [
    { "id": "1", "type": "input", "position": { "x": 250, "y": 0 }, "data": { "label": "Start" } },
    { "id": "2", "type": "default", "position": { "x": 250, "y": 100 }, "data": { "label": "Process" } },
    { "id": "3", "type": "output", "position": { "x": 250, "y": 200 }, "data": { "label": "End" } }
  ],
  "edges": [
    { "id": "e1-2", "source": "1", "target": "2" },
    { "id": "e2-3", "source": "2", "target": "3" }
  ]
}

Node types:
- "input": Starting point
- "output": End point
- "decision": Conditional/branching
- "default": Standard process step

Rules:
1. Position nodes vertically (increment y by 100)
2. Use unique string IDs
3. Return ONLY the JSON object

User request: `;

// ============================================================================
// GET Handler - Health Check
// ============================================================================

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  const isConfigured = !!apiKey && apiKey.length > 10;
  
  return NextResponse.json({
    status: 'ok',
    provider: 'Google Gemini',
    model: 'gemini-pro',
    apiKeyConfigured: isConfigured,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'not set',
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
    const apiKey = process.env.GEMINI_API_KEY;
    
    if (!apiKey) {
      return NextResponse.json(
        { 
          error: 'Gemini API key not configured. Please add GEMINI_API_KEY to your environment variables.', 
          code: 'API_KEY_MISSING',
          help: 'Get your API key at https://aistudio.google.com/app/apikey'
        },
        { status: 500 }
      );
    }

    // Initialize Google Generative AI client
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Use gemini-pro model (widely available)
    const model = genAI.getGenerativeModel({ model: 'gemini-pro' });

    // Generate content with simple prompt
    const fullPrompt = PROMPT_TEMPLATE + prompt;
    
    const result = await model.generateContent(fullPrompt);
    const response = result.response;
    const text = response.text();

    if (!text) {
      return NextResponse.json(
        { error: 'No response from Gemini', code: 'EMPTY_RESPONSE' },
        { status: 500 }
      );
    }

    // Parse JSON response - clean up any markdown formatting
    let flowData: GeneratedFlow;
    try {
      let cleanedText = text.trim();
      
      // Remove markdown code blocks if present
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.slice(7);
      } else if (cleanedText.startsWith('```')) {
        cleanedText = cleanedText.slice(3);
      }
      if (cleanedText.endsWith('```')) {
        cleanedText = cleanedText.slice(0, -3);
      }
      cleanedText = cleanedText.trim();
      
      flowData = JSON.parse(cleanedText);
    } catch (parseError) {
      console.error('Failed to parse Gemini response:', text);
      return NextResponse.json(
        { 
          error: 'Invalid JSON response from AI', 
          code: 'PARSE_ERROR', 
          raw: text.substring(0, 500) 
        },
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
      flowData.edges = [];
    }

    // Return the flow data
    return NextResponse.json({
      success: true,
      data: flowData,
    });

  } catch (error: unknown) {
    console.error('Error generating flow:', error);
    
    const errorObj = error as { message?: string };
    const fullMessage = errorObj?.message || String(error);
    const message = fullMessage.toLowerCase();
    
    if (message.includes('api key') || message.includes('api_key') || message.includes('invalid')) {
      return NextResponse.json(
        { 
          error: 'Invalid API key. Please check your Gemini API key.', 
          code: 'API_KEY_INVALID',
          help: 'Get a new key at https://aistudio.google.com/app/apikey'
        },
        { status: 401 }
      );
    }
    
    if (message.includes('quota') || message.includes('rate') || message.includes('resource') || message.includes('429')) {
      return NextResponse.json(
        { 
          error: 'Rate limit exceeded. Please wait a moment and try again.', 
          code: 'RATE_LIMIT',
          help: 'Gemini free tier: 15 requests/minute'
        },
        { status: 429 }
      );
    }

    if (message.includes('not found') || message.includes('404')) {
      return NextResponse.json(
        { 
          error: 'Model not available. Trying alternative...', 
          code: 'MODEL_NOT_FOUND',
          details: fullMessage
        },
        { status: 404 }
      );
    }
    
    return NextResponse.json(
      { 
        error: 'Failed to generate flow', 
        code: 'GENERATION_ERROR',
        details: fullMessage
      },
      { status: 500 }
    );
  }
}
