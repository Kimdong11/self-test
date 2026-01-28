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
// GET Handler - Health Check & List Models
// ============================================================================

export async function GET(request: NextRequest) {
  const apiKey = process.env.GEMINI_API_KEY;
  const isConfigured = !!apiKey && apiKey.length > 10;
  
  const url = new URL(request.url);
  const testMode = url.searchParams.get('test') === 'true';
  
  // If test mode, try to list available models
  if (testMode && apiKey) {
    try {
      const response = await fetch(
        `https://generativelanguage.googleapis.com/v1beta/models?key=${apiKey}`
      );
      const data = await response.json();
      
      return NextResponse.json({
        status: 'ok',
        provider: 'Google Gemini',
        apiKeyConfigured: isConfigured,
        apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'not set',
        availableModels: data.models?.map((m: { name: string }) => m.name) || [],
        rawResponse: data,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      return NextResponse.json({
        status: 'error',
        error: String(err),
        timestamp: new Date().toISOString(),
      });
    }
  }
  
  return NextResponse.json({
    status: 'ok',
    provider: 'Google Gemini',
    model: 'gemini-2.0-flash',
    apiKeyConfigured: isConfigured,
    apiKeyPrefix: apiKey ? `${apiKey.substring(0, 10)}...` : 'not set',
    timestamp: new Date().toISOString(),
    hint: 'Add ?test=true to list available models',
  });
}

// ============================================================================
// POST Handler - Generate Flow
// ============================================================================

export async function POST(request: NextRequest) {
  const debugInfo: Record<string, unknown> = {
    timestamp: new Date().toISOString(),
    steps: [] as string[],
  };
  
  try {
    // Parse request body
    debugInfo.steps = [...(debugInfo.steps as string[]), 'parsing_body'];
    const body = await request.json();
    const { prompt } = body;
    debugInfo.prompt = prompt;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: 'Missing or invalid prompt', code: 'INVALID_PROMPT', debug: debugInfo },
        { status: 400 }
      );
    }

    // Check for API key
    debugInfo.steps = [...(debugInfo.steps as string[]), 'checking_api_key'];
    const apiKey = process.env.GEMINI_API_KEY;
    debugInfo.apiKeyExists = !!apiKey;
    debugInfo.apiKeyLength = apiKey?.length || 0;
    debugInfo.apiKeyPrefix = apiKey ? apiKey.substring(0, 10) + '...' : 'none';
    
    if (!apiKey) {
      return NextResponse.json(
        { 
          error: 'Gemini API key not configured', 
          code: 'API_KEY_MISSING',
          debug: debugInfo
        },
        { status: 500 }
      );
    }

    // Initialize Google Generative AI client
    debugInfo.steps = [...(debugInfo.steps as string[]), 'initializing_client'];
    const genAI = new GoogleGenerativeAI(apiKey);
    
    // Try multiple models
    const modelsToTry = ['gemini-2.0-flash', 'gemini-1.5-flash', 'gemini-pro', 'gemini-1.0-pro'];
    let lastError: unknown = null;
    let result = null;
    let usedModel = '';
    
    for (const modelName of modelsToTry) {
      try {
        debugInfo.steps = [...(debugInfo.steps as string[]), `trying_model_${modelName}`];
        const model = genAI.getGenerativeModel({ model: modelName });
        
        const fullPrompt = PROMPT_TEMPLATE + prompt;
        debugInfo.promptLength = fullPrompt.length;
        
        result = await model.generateContent(fullPrompt);
        usedModel = modelName;
        debugInfo.steps = [...(debugInfo.steps as string[]), `success_with_${modelName}`];
        break; // Success, exit loop
      } catch (modelError: unknown) {
        lastError = modelError;
        const errMsg = modelError instanceof Error ? modelError.message : String(modelError);
        debugInfo[`error_${modelName}`] = errMsg;
        
        // If it's not a 404/model not found error, don't try other models
        if (!errMsg.includes('404') && !errMsg.includes('not found')) {
          break;
        }
      }
    }
    
    if (!result) {
      const errMsg = lastError instanceof Error ? lastError.message : String(lastError);
      return NextResponse.json(
        { 
          error: 'All models failed', 
          code: 'ALL_MODELS_FAILED',
          lastError: errMsg,
          debug: debugInfo
        },
        { status: 500 }
      );
    }
    
    debugInfo.usedModel = usedModel;
    debugInfo.steps = [...(debugInfo.steps as string[]), 'extracting_response'];
    
    const response = result.response;
    const text = response.text();
    debugInfo.responseLength = text?.length || 0;
    debugInfo.responsePreview = text?.substring(0, 200) || 'empty';

    if (!text) {
      return NextResponse.json(
        { error: 'No response from Gemini', code: 'EMPTY_RESPONSE', debug: debugInfo },
        { status: 500 }
      );
    }

    // Parse JSON response
    debugInfo.steps = [...(debugInfo.steps as string[]), 'parsing_json'];
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
      debugInfo.steps = [...(debugInfo.steps as string[]), 'json_parsed'];
    } catch (parseError) {
      return NextResponse.json(
        { 
          error: 'Invalid JSON response from AI', 
          code: 'PARSE_ERROR', 
          raw: text.substring(0, 500),
          debug: debugInfo
        },
        { status: 500 }
      );
    }

    // Validate response structure
    if (!flowData.nodes || !Array.isArray(flowData.nodes)) {
      return NextResponse.json(
        { error: 'Invalid flow structure: missing nodes', code: 'INVALID_STRUCTURE', debug: debugInfo },
        { status: 500 }
      );
    }

    if (!flowData.edges || !Array.isArray(flowData.edges)) {
      flowData.edges = [];
    }

    debugInfo.steps = [...(debugInfo.steps as string[]), 'success'];
    debugInfo.nodesCount = flowData.nodes.length;
    debugInfo.edgesCount = flowData.edges.length;

    // Return the flow data
    return NextResponse.json({
      success: true,
      data: flowData,
      debug: debugInfo,
    });

  } catch (error: unknown) {
    const errorObj = error as { message?: string; stack?: string };
    debugInfo.finalError = errorObj?.message || String(error);
    debugInfo.errorStack = errorObj?.stack;
    
    return NextResponse.json(
      { 
        error: 'Unexpected error', 
        code: 'UNEXPECTED_ERROR',
        details: errorObj?.message || String(error),
        debug: debugInfo
      },
      { status: 500 }
    );
  }
}
