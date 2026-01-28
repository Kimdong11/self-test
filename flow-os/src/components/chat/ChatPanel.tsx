'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Loader2, Workflow, Zap, CheckCircle, XCircle } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatInput } from './ChatInput';
import { useFlowStore } from '@/lib/store';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
  status?: 'success' | 'error';
}

interface ChatPanelProps {
  className?: string;
}

// Keywords that indicate workflow creation intent
const WORKFLOW_KEYWORDS = [
  'workflow', 'flow', 'process', 'steps', 'pipeline',
  'automate', 'automation', 'sequence', 'diagram',
  '->', 'then', '순서', '프로세스', '워크플로우', '흐름'
];

function isWorkflowRequest(message: string): boolean {
  const lower = message.toLowerCase();
  return WORKFLOW_KEYWORDS.some(keyword => lower.includes(keyword)) ||
    message.includes('->') ||
    message.includes(',') && message.split(',').length >= 2;
}

export function ChatPanel({ className }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: `Welcome to Flow-OS! 🚀

I can help you create workflows from text descriptions. Try these formats:

• **Arrow format:** "Start -> Process -> End"
• **Comma format:** "Step 1, Step 2, Step 3"
• **Natural:** "Get data then process then save"

Or just describe your workflow and I'll visualize it!`,
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);
  
  // Get store actions
  const { loadFromText, appendFromText, nodes } = useFlowStore();

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [messages]);

  const handleSend = async (content: string) => {
    const userMessage: Message = {
      id: Date.now().toString(),
      role: 'user',
      content,
      timestamp: new Date(),
    };

    setMessages((prev) => [...prev, userMessage]);
    setIsLoading(true);

    // Simulate small delay for better UX
    await new Promise((resolve) => setTimeout(resolve, 500));

    try {
      let assistantMessage: Message;

      // Check if this looks like a workflow request
      if (isWorkflowRequest(content)) {
        // Determine whether to replace or append
        const shouldAppend = nodes.length > 0 && 
          (content.toLowerCase().includes('add') || 
           content.toLowerCase().includes('append') ||
           content.toLowerCase().includes('추가'));

        const result = shouldAppend 
          ? appendFromText(content)
          : loadFromText(content);

        if (result.success && result.graph) {
          const nodeCount = result.graph.nodes.length;
          const edgeCount = result.graph.edges.length;
          
          assistantMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `✨ Workflow created successfully!

**Generated:**
• ${nodeCount} node${nodeCount !== 1 ? 's' : ''}
• ${edgeCount} connection${edgeCount !== 1 ? 's' : ''}

${result.rawParsed?.steps.map((step, i) => 
  `${i + 1}. **${step.name}** (${step.type})`
).join('\n')}

The workflow is now visible on the canvas. You can drag nodes to rearrange them or click "Add Node" to add more steps.`,
            timestamp: new Date(),
            status: 'success',
          };
        } else {
          assistantMessage = {
            id: (Date.now() + 1).toString(),
            role: 'assistant',
            content: `❌ Couldn't create workflow: ${result.error}

**Tips:**
• Use arrows: "A -> B -> C"
• Use commas: "Step 1, Step 2, Step 3"
• Or describe steps on separate lines`,
            timestamp: new Date(),
            status: 'error',
          };
        }
      } else {
        // General conversation
        assistantMessage = {
          id: (Date.now() + 1).toString(),
          role: 'assistant',
          content: `I can help you create workflows! Try describing your process using one of these formats:

• **Arrows:** "Receive order -> Process payment -> Ship item"
• **Steps:** "1. Get input, 2. Validate, 3. Save"
• **Natural:** "First authenticate then fetch data then display"

What workflow would you like to create?`,
          timestamp: new Date(),
        };
      }

      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error processing message:', error);
      
      const errorMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'Sorry, something went wrong. Please try again.',
        timestamp: new Date(),
        status: 'error',
      };
      setMessages((prev) => [...prev, errorMessage]);
    } finally {
      setIsLoading(false);
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
              Text-to-Graph workflow generator
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
                    : "bg-flow-accent/10 border border-flow-accent/30"
                )}>
                  {message.status === 'success' ? (
                    <CheckCircle className="w-4 h-4 text-green-500" />
                  ) : message.status === 'error' ? (
                    <XCircle className="w-4 h-4 text-red-500" />
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
              <div className="flex gap-1.5">
                <span className="w-2 h-2 bg-flow-accent/60 rounded-full animate-bounce" style={{ animationDelay: '0ms' }} />
                <span className="w-2 h-2 bg-flow-accent/60 rounded-full animate-bounce" style={{ animationDelay: '150ms' }} />
                <span className="w-2 h-2 bg-flow-accent/60 rounded-full animate-bounce" style={{ animationDelay: '300ms' }} />
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
        placeholder="Describe your workflow... (e.g., A -> B -> C)"
      />
    </div>
  );
}

export default ChatPanel;
