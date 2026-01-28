'use client';

import { useState, useRef, useEffect } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Bot, User, Loader2, Workflow, Zap } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ChatInput } from './ChatInput';

export interface Message {
  id: string;
  role: 'user' | 'assistant';
  content: string;
  timestamp: Date;
}

interface ChatPanelProps {
  className?: string;
  onSendMessage?: (message: string) => Promise<void>;
}

export function ChatPanel({ className, onSendMessage }: ChatPanelProps) {
  const [messages, setMessages] = useState<Message[]>([
    {
      id: '1',
      role: 'assistant',
      content: 'Welcome to Flow-OS! I\'m your AI workflow assistant. Describe the workflow you want to create, and I\'ll help you build it on the canvas.',
      timestamp: new Date(),
    },
  ]);
  const [isLoading, setIsLoading] = useState(false);
  const messagesEndRef = useRef<HTMLDivElement>(null);

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

    try {
      if (onSendMessage) {
        await onSendMessage(content);
      }
      
      // Placeholder response - integrate with OpenAI
      await new Promise((resolve) => setTimeout(resolve, 1000));
      
      const assistantMessage: Message = {
        id: (Date.now() + 1).toString(),
        role: 'assistant',
        content: 'I understand you want to create a workflow. Let me help you design it. I\'ll add the necessary nodes to your canvas. What specific steps or tasks should be included?',
        timestamp: new Date(),
      };
      setMessages((prev) => [...prev, assistantMessage]);
    } catch (error) {
      console.error('Error sending message:', error);
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
                <div className="flex-shrink-0 w-8 h-8 rounded-lg bg-flow-accent/10 border border-flow-accent/30 flex items-center justify-center">
                  <Bot className="w-4 h-4 text-flow-accent" />
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
                <p className="text-sm leading-relaxed whitespace-pre-wrap">
                  {message.content}
                </p>
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
      <ChatInput onSend={handleSend} isLoading={isLoading} />
    </div>
  );
}

export default ChatPanel;
