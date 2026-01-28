'use client';

import { useState, useRef, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Loader2, Workflow, Zap, CheckCircle, XCircle, AlertTriangle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatInput } from './ChatInput';
import { useFlowStore, type APIFlowResponse } from '@/lib/store';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'success' | 'error' | 'warning';
}

interface ChatPanelProps {
  className?: string;
}

// Check if message is a simple format that can be parsed locally
function isSimpleFormat(message: string): boolean {
  return message.includes('->') ||
    (message.includes(',') && message.split(',').length >= 2 && message.split(',').every(s => s.trim().length < 50));
}

export function ChatPanel({ className }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Welcome to Flow-OS! 🚀

I'm powered by AI and can help you create workflows from natural language descriptions.

**Try describing your workflow:**
• "User login flow for an e-commerce app"
• "CI/CD pipeline for a Node.js project"
• "Customer support ticket handling process"

Or use simple formats:
• "Login -> Validate -> Dashboard"
• "Step 1, Step 2, Step 3"`,
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get store actions
  const { loadFromText, loadFromAPIResponse, nodes, setError } = useFlowStore();

  const scrollToBottom = useCallback(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, []);

  useEffect(() => {
    scrollToBottom();
  }, [messages, scrollToBottom]);

  // Call the real OpenAI API
  const generateFlowWithAI = async (prompt: string): Promise<{ success: boolean; data?: APIFlowResponse; error?: string }> => {
    try {
      const response = await fetch('/api/gen-flow', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ prompt }),
      });

      const result = await response.json();

      if (!response.ok) {
        return { success: false, error: result.error || 'Failed to generate flow' };
      }

      if (result.success && result.data) {
        return { success: true, data: result.data };
      }

      return { success: false, error: result.error || 'Invalid response' };
    } catch (error) {
      console.error('API call failed:', error);
      return { success: false, error: 'Network error. Please try again.' };
    }
  };

  const handleSend = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    try {
      let assistantMessage: Message;

      // Check if it's a simple format that can be parsed locally (faster)
      if (isSimpleFormat(content)) {
        const result = loadFromText(content);

        if (result.success && result.graph) {
          const nodeCount = result.graph.nodes.length;
          const edgeCount = result.graph.edges.length;
          
          assistantMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `✨ Workflow created!

**Generated:** ${nodeCount} nodes, ${edgeCount} connections

${result.rawParsed?.steps.map((step, i) => 
  `${i + 1}. **${step.name}**`
).join('\n')}

You can drag nodes to rearrange them or double-click to edit labels.`,
            timestamp: new Date(),
            status: 'success',
          };
        } else {
          // Fall back to AI if local parsing fails
          assistantMessage = await handleAIGeneration(content);
        }
      } else {
        // Use AI for complex/natural language requests
        assistantMessage = await handleAIGeneration(content);
      }

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error processing message:', error);
      setError('Failed to process message');
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ Sorry, something went wrong. Please try again.

**Tips:**
• Check your internet connection
• Try a simpler description
• Use arrow format: "A -> B -> C"`,
        timestamp: new Date(),
        status: 'error',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
    }
  };

  const handleAIGeneration = async (content: string): Promise<Message> => {
    const result = await generateFlowWithAI(content);

    if (result.success && result.data) {
      // Load the AI-generated flow into the store
      loadFromAPIResponse(result.data);
      
      const nodeCount = result.data.nodes.length;
      const edgeCount = result.data.edges.length;

      // Get node labels for display
      const nodeLabels = result.data.nodes
        .slice(0, 5)
        .map((n, i) => `${i + 1}. **${n.data.label}** (${n.type})`)
        .join('\n');
      
      const moreNodes = nodeCount > 5 ? `\n... and ${nodeCount - 5} more nodes` : '';

      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `✨ AI-generated workflow created!

**Generated:** ${nodeCount} nodes, ${edgeCount} connections

${nodeLabels}${moreNodes}

The workflow is now visible on the canvas. You can:
• Drag nodes to rearrange
• Double-click to edit labels
• Click "Auto Layout" to reorganize`,
        timestamp: new Date(),
        status: 'success',
      };
    } else {
      // Check if it's an API key error
      const isApiKeyError = result.error?.toLowerCase().includes('api key');
      
      if (isApiKeyError) {
        // Fall back to local parsing
        const localResult = loadFromText(content);
        
        if (localResult.success && localResult.graph) {
          return {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `⚠️ AI service not configured. Using local parser instead.

**Generated:** ${localResult.graph.nodes.length} nodes, ${localResult.graph.edges.length} connections

For AI-powered generation, configure your OpenAI API key in the environment variables.`,
            timestamp: new Date(),
            status: 'warning',
          };
        }
      }

      setError(result.error || 'Failed to generate flow');
      
      return {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: `❌ ${result.error || 'Failed to generate flow'}

**Try these alternatives:**
• Use arrow format: "Login -> Validate -> Dashboard"
• Use comma format: "Step 1, Step 2, Step 3"
• Simplify your description`,
        timestamp: new Date(),
        status: 'error',
      };
    }
  };

  return (
    <div
      className={cn(
        'flex flex-col h-full bg-flow-bg-darker',
        className
      )}
    >
      {/* Header */}
      <div className="p-4 border-b border-flow-border">
        <div className="flex items-center gap-3">
          <div className="p-2 rounded-lg bg-flow-accent/10 border border-flow-accent/30">
            <Workflow className="w-5 h-5 text-flow-accent" />
          </div>
          <div>
            <h2 className="text-base font-semibold text-flow-text flex items-center gap-2">
              Flow-OS
              <span className="flex items-center gap-1 px-2 py-0.5 rounded-full bg-flow-accent/10 text-flow-accent text-xs font-medium">
                <Zap className="w-3 h-3" />
                AI
              </span>
            </h2>
            <p className="text-xs text-flow-text-muted">
              AI-powered workflow generator
            </p>
          </div>
        </div>
      </div>

      {/* Messages */}
      <div className="flex-1 overflow-y-auto p-4 space-y-4 scrollbar-thin">
        <AnimatePresence initial={false}>
          {messages.map((message) => (
            <motion.div
              key={message.id}
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              transition={{ duration: 0.2 }}
              className={cn(
                'flex gap-3',
                message.role === 'user' ? 'justify-end' : 'justify-start'
              )}
            >
              {message.role === 'assistant' && (
                <div className={cn(
                  "flex-shrink-0 w-8 h-8 rounded-lg flex items-center justify-center",
                  message.status === 'success' 
                    ? "bg-green-500/10 border border-green-500/30"
                    : message.status === 'error'
                    ? "bg-red-500/10 border border-red-500/30"
                    : message.status === 'warning'
                    ? "bg-yellow-500/10 border border-yellow-500/30"
                    : "bg-flow-accent/10 border border-flow-accent/30"
                )}>
                  {message.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : message.status === 'error' ? (
                    <XCircle className="w-4 h-4 text-red-500" />
                  ) : message.status === 'warning' ? (
                    <AlertTriangle className="w-4 h-4 text-yellow-500" />
                  ) : (
                    <Bot className="w-4 h-4 text-flow-accent" />
                  )}
                </div>
              )}
              <div
                className={cn(
                  'max-w-[85%] rounded-2xl px-4 py-2.5',
                  message.role === 'user'
                    ? 'bg-flow-accent text-flow-bg-dark rounded-br-md'
                    : 'bg-flow-surface border border-flow-border text-flow-text rounded-bl-md'
                )}
              >
                <div className="text-sm leading-relaxed whitespace-pre-wrap prose prose-sm prose-invert max-w-none">
                  {message.content.split('\n').map((line, i) => {
                    // Simple markdown-like formatting
                    const formatted = line
                      .replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>')
                      .replace(/\*(.*?)\*/g, '<em>$1</em>');
                    return (
                      <span 
                        key={i} 
                        dangerouslySetInnerHTML={{ __html: formatted }}
                        className="block"
                      />
                    );
                  })}
                </div>
                <p className={cn(
                  "text-[10px] mt-1.5",
                  message.role === 'user' ? 'text-flow-bg-dark/60' : 'text-flow-text-muted'
                )}>
                  {message.timestamp.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                </p>
              </div>
              {message.role === 'user' && (
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-flow-accent flex items-center justify-center">
                  <User className="w-4 h-4 text-flow-bg-dark" />
                </div>
              )}
            </motion.div>
          ))}
        </AnimatePresence>
        
        {isLoading && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            className="flex gap-3"
          >
            <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-flow-accent/10 border border-flow-accent/30 flex items-center justify-center">
              <Loader2 className="w-4 h-4 text-flow-accent animate-spin" />
            </div>
            <div className="bg-flow-surface border border-flow-border rounded-2xl rounded-bl-md px-4 py-3">
              <div className="flex items-center gap-2">
                <div className="flex gap-1.5">
                  <span className="w-2 h-2 bg-flow-accent/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                  <span className="w-2 h-2 bg-flow-accent/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                  <span className="w-2 h-2 bg-flow-accent/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
                </div>
                <span className="text-xs text-flow-text-muted ml-2">Generating workflow...</span>
              </div>
            </div>
          </motion.div>
        )}
        
        <div ref={messagesEndRef} />
      </div>

      {/* Input - Fixed at bottom */}
      <ChatInput 
        onSend={handleSend} 
        isLoading={isLoading}
      />
    </div>
  );
}

export default ChatPanel;
