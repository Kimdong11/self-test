/**
 * OpenAI Integration for Flow-OS
 * 
 * Handles AI-powered text-to-workflow conversion using the OpenAI API.
 */

import OpenAI from 'openai';
import type {
  ParsedWorkflow,
  WorkflowStep,
  GraphNodeType,
  AIWorkflowResponse,
} from '../types';

// ============================================================================
// Configuration
// ============================================================================

/**
 * Create OpenAI client instance
 * API key should be provided via environment variable or passed directly
 */
export function createOpenAIClient(apiKey?: string): OpenAI {
  const key = apiKey || process.env.OPENAI_API_KEY;
  
  if (!key) {
    throw new Error('OpenAI API key is required. Set OPENAI_API_KEY environment variable or pass it directly.');
  }
  
  return new OpenAI({
    apiKey: key,
    dangerouslyAllowBrowser: true, // Required for client-side usage
  });
}

// ============================================================================
// System Prompts
// ============================================================================

const WORKFLOW_PARSER_SYSTEM_PROMPT = `You are a workflow parser assistant. Your job is to analyze text descriptions of workflows and convert them into a structured JSON format.

Given a text description of a workflow or process, extract the individual steps and their relationships.

Rules:
1. Each step should have a unique ID (use format: step-1, step-2, etc.)
2. Identify the step type:
   - "input": Starting points, triggers, data inputs
   - "output": End points, final deliverables, results
   - "default": All intermediate processing steps
3. Identify dependencies between steps (which step depends on which)
4. Keep step names concise but descriptive
5. Add brief descriptions when helpful

Always respond with valid JSON in this exact format:
{
  "workflow": {
    "title": "Brief title for the workflow",
    "description": "Optional longer description",
    "steps": [
      {
        "id": "step-1",
        "name": "Step Name",
        "description": "Optional description",
        "type": "input" | "default" | "output",
        "dependsOn": ["step-id"] // Array of step IDs this step depends on
      }
    ]
  }
}`;

// ============================================================================
// API Functions
// ============================================================================

export interface ParseTextOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
}

/**
 * Parse text description into workflow structure using OpenAI
 */
export async function parseTextWithAI(
  text: string,
  options: ParseTextOptions = {}
): Promise<ParsedWorkflow> {
  const {
    apiKey,
    model = 'gpt-4o-mini',
    temperature = 0.3,
  } = options;

  const client = createOpenAIClient(apiKey);

  const response = await client.chat.completions.create({
    model,
    temperature,
    response_format: { type: 'json_object' },
    messages: [
      {
        role: 'system',
        content: WORKFLOW_PARSER_SYSTEM_PROMPT,
      },
      {
        role: 'user',
        content: `Parse the following workflow description:\n\n${text}`,
      },
    ],
  });

  const content = response.choices[0]?.message?.content;
  
  if (!content) {
    throw new Error('No response received from OpenAI');
  }

  const parsed = JSON.parse(content) as AIWorkflowResponse;
  
  // Convert AI response to ParsedWorkflow format
  return aiResponseToWorkflow(parsed);
}

/**
 * Convert AI response format to internal ParsedWorkflow format
 */
function aiResponseToWorkflow(response: AIWorkflowResponse): ParsedWorkflow {
  const steps: WorkflowStep[] = response.workflow.steps.map(step => ({
    id: step.id,
    name: step.name,
    description: step.description,
    type: step.type as GraphNodeType,
    dependencies: step.dependsOn?.length > 0 ? step.dependsOn : undefined,
  }));

  return {
    title: response.workflow.title,
    description: response.workflow.description,
    steps,
  };
}

// ============================================================================
// Chat Integration
// ============================================================================

export interface ChatMessage {
  role: 'user' | 'assistant' | 'system';
  content: string;
}

export interface ChatOptions {
  apiKey?: string;
  model?: string;
  temperature?: number;
  systemPrompt?: string;
}

const DEFAULT_CHAT_SYSTEM_PROMPT = `You are Flow-OS, an AI assistant that helps users create and manage workflows. You can:

1. Help users describe their workflows in natural language
2. Suggest improvements to existing workflows
3. Explain workflow concepts
4. Answer questions about workflow automation

When a user describes a workflow they want to create, acknowledge their request and let them know you'll help visualize it on the canvas.

Keep responses concise and helpful. Use bullet points for lists of steps.`;

/**
 * Send a chat message and get a response
 */
export async function sendChatMessage(
  messages: ChatMessage[],
  options: ChatOptions = {}
): Promise<string> {
  const {
    apiKey,
    model = 'gpt-4o-mini',
    temperature = 0.7,
    systemPrompt = DEFAULT_CHAT_SYSTEM_PROMPT,
  } = options;

  const client = createOpenAIClient(apiKey);

  const response = await client.chat.completions.create({
    model,
    temperature,
    messages: [
      { role: 'system', content: systemPrompt },
      ...messages,
    ],
  });

  return response.choices[0]?.message?.content || 'I apologize, I could not generate a response.';
}

// ============================================================================
// Workflow Generation from Chat
// ============================================================================

/**
 * Determine if a message is requesting workflow creation
 */
export function isWorkflowRequest(message: string): boolean {
  const workflowKeywords = [
    'create workflow',
    'build workflow',
    'make workflow',
    'design workflow',
    'workflow for',
    'automate',
    'process for',
    'steps for',
    'flow for',
    'create a flow',
    'build a process',
    'pipeline for',
  ];

  const lowerMessage = message.toLowerCase();
  return workflowKeywords.some(keyword => lowerMessage.includes(keyword));
}

/**
 * Extract workflow description from a chat message
 */
export function extractWorkflowDescription(message: string): string {
  // Remove common prefixes
  const prefixes = [
    'create a workflow for',
    'build a workflow for',
    'make a workflow for',
    'design a workflow for',
    'create workflow for',
    'build workflow for',
    'i need a workflow for',
    'i want to automate',
    'help me create',
    'help me build',
    'can you create',
    'can you build',
    'please create',
    'please build',
  ];

  let cleaned = message.toLowerCase();
  
  for (const prefix of prefixes) {
    if (cleaned.startsWith(prefix)) {
      cleaned = cleaned.slice(prefix.length).trim();
      break;
    }
  }

  // Return original if no prefix was found (preserving case)
  if (cleaned === message.toLowerCase()) {
    return message.trim();
  }

  // Find the cleaned text in the original message (case-insensitive match)
  const index = message.toLowerCase().indexOf(cleaned);
  if (index !== -1) {
    return message.slice(index).trim();
  }

  return message.trim();
}
