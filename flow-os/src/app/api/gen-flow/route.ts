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
// System Prompt
// ============================================================================

const SYSTEM_PROMPT = `You are a professional workflow architect. Create a node-based workflow for React Flow based on the user's request.

Return ONLY a JSON object with this exact schema:
{
  "nodes": [
    { 
      "id": "string", 
      "type": "default" (for standard) or "input" (start) or "output" (end) or "decision" (diamond shape), 
      "position": { "x": number, "y": number }, 
      "data": { "label": "string" } 
    }
  ],
  "edges": [
    { "id": "string", "source": "string", "target": "string", "label": "string (optional)" }
  ]
}

Rules:
1. Layout the nodes logically (e.g., Input at top, Output at bottom). Use simple x, y coordinates (increment y by 100 for each step).
2. Ensure IDs are unique strings.
3. Do not include markdown code blocks (\`\`\`json), just the raw JSON.
4. Use "input" type for starting nodes (triggers, inputs, start points).
5. Use "output" type for ending nodes (results, outputs, end points).
6. Use "decision" type for conditional/branching nodes (if/else, switches).
7. Use "default" type for all other processing steps.
8. Keep labels concise but descriptive.`;

// ============================================================================
// GET Handler - Health Check
// ============================================================================

export async function GET() {
  const apiKey = process.env.GEMINI_API_KEY;
  const isConfigured = !!apiKey && apiKey.length > 10;
  
  return NextResponse.json({
    status: 'ok',
    provider: 'Google Gemini',
    model: 'gemini-1.5-flash',
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
    
    // Select the model
    const model = genAI.getGenerativeModel({
      model: 'gemini-1.5-flash',
      systemInstruction: SYSTEM_PROMPT,
    });

    // Configure generation to force JSON output
    const generationConfig = {
      temperature: 0.7,
      topK: 40,
      topP: 0.95,
      maxOutputTokens: 2048,
      responseMimeType: 'application/json',
    };

    // Generate content
    let result;
    try {
      result = await model.generateContent({
        contents: [
          {
            role: 'user',
            parts: [{ text: `Create a workflow for: ${prompt}` }],
          },
        ],
        generationConfig,
      });
    } catch (genError) {
      console.error('Gemini generation error:', genError);
      throw genError;
    }

    // Extract response
    const response = result.response;
    const text = response.text();

    if (!text) {
      return NextResponse.json(
        { error: 'No response from Gemini', code: 'EMPTY_RESPONSE' },
        { status: 500 }
      );
    }

    // Parse JSON response
    let flowData: GeneratedFlow;
    try {
      // Clean the response in case it has markdown code blocks
      let cleanedText = text.trim();
      if (cleanedText.startsWith('```json')) {
        cleanedText = cleanedText.slice(7);
      }
      if (cleanedText.startsWith('```')) {
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
        { error: 'Invalid JSON response from AI', code: 'PARSE_ERROR', raw: text.substring(0, 200) },
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
    
    // Handle specific errors
    if (error instanceof Error) {
      const message = error.message.toLowerCase();
      const fullMessage = error.message;
      
      if (message.includes('api key') || message.includes('api_key') || message.includes('invalid')) {
        return NextResponse.json(
          { 
            error: 'Invalid API key. Please check your Gemini API key.', 
            code: 'API_KEY_INVALID',
            help: 'Get a new key at https://aistudio.google.com/app/apikey',
            details: fullMessage
          },
          { status: 401 }
        );
      }
      
      if (message.includes('quota') || message.includes('rate') || message.includes('resource')) {
        return NextResponse.json(
          { 
            error: 'Rate limit exceeded or quota exhausted.', 
            code: 'RATE_LIMIT',
            help: 'Wait a moment and try again, or check your quota at Google AI Studio',
            details: fullMessage
          },
          { status: 429 }
        );
      }

      if (message.includes('permission') || message.includes('denied') || message.includes('not enabled')) {
        return NextResponse.json(
          { 
            error: 'API not enabled or permission denied.', 
            code: 'PERMISSION_DENIED',
            help: 'Enable the Generative Language API at https://console.cloud.google.com/apis/library/generativelanguage.googleapis.com',
            details: fullMessage
          },
          { status: 403 }
        );
      }
      
      return NextResponse.json(
        { error: fullMessage, code: 'GENERATION_ERROR' },
        { status: 500 }
      );
    }

    return NextResponse.json(
      { error: 'Failed to generate flow', code: 'UNKNOWN_ERROR' },
      { status: 500 }
    );
  }
}
