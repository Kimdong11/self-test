'use client';

import { useState, useRef, useEffect } from 'react';
import { motion } from 'framer-motion';
import { Send, Sparkles } from 'lucide-react';
import { cn } from '@/lib/utils';

interface ChatInputProps {
  onSend: (message: string) => void;
  isLoading?: boolean;
  placeholder?: string;
  className?: string;
}

const DEFAULT_PLACEHOLDER = "Describe your workflow... (e.g., 'Login Process for Shopping App')";

export function ChatInput({
  onSend,
  isLoading = false,
  placeholder = DEFAULT_PLACEHOLDER,
  className,
}: ChatInputProps) {
  const [input, setInput] = useState('');
  const textareaRef = useRef<HTMLTextAreaElement>(null);

  // Auto-resize textarea
  useEffect(() => {
    const textarea = textareaRef.current;
    if (textarea) {
      textarea.style.height = 'auto';
      textarea.style.height = `${Math.min(textarea.scrollHeight, 120)}px`;
    }
  }, [input]);

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!input.trim() || isLoading) return;
    onSend(input.trim());
    setInput('');
  };

  const handleKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      handleSubmit(e);
    }
  };

  return (
    <div className={cn("p-4 border-t border-flow-border bg-flow-bg-darker", className)}>
      <form onSubmit={handleSubmit} className="relative">
        <div className="relative flex items-end gap-2 p-1 rounded-xl bg-flow-surface border border-flow-border focus-within:border-flow-accent focus-within:glow-accent-sm transition-all duration-200">
          <div className="absolute left-3 top-3 text-flow-accent">
            <Sparkles className="w-4 h-4" />
          </div>
          
          <textarea
            ref={textareaRef}
            value={input}
            onChange={(e) => setInput(e.target.value)}
            onKeyDown={handleKeyDown}
            placeholder={placeholder}
            disabled={isLoading}
            rows={1}
            className={cn(
              "flex-1 bg-transparent text-flow-text text-sm resize-none",
              "placeholder:text-flow-text-muted",
              "focus:outline-none",
              "disabled:opacity-50 disabled:cursor-not-allowed",
              "py-2.5 pl-9 pr-2",
              "max-h-[120px] scrollbar-thin"
            )}
          />
          
          <motion.button
            type="submit"
            disabled={!input.trim() || isLoading}
            whileHover={{ scale: 1.05 }}
            whileTap={{ scale: 0.95 }}
            className={cn(
              "flex items-center justify-center",
              "w-9 h-9 rounded-lg mb-0.5 mr-0.5",
              "bg-flow-accent text-flow-bg-dark",
              "hover:bg-flow-accent-dim transition-colors",
              "disabled:opacity-40 disabled:cursor-not-allowed disabled:hover:bg-flow-accent",
              "shadow-lg shadow-flow-accent/20"
            )}
          >
            <Send className="w-4 h-4" />
          </motion.button>
        </div>
        
        <p className="mt-2 text-xs text-flow-text-muted text-center">
          Press <kbd className="px-1.5 py-0.5 rounded bg-flow-surface text-flow-text text-[10px] font-mono">Enter</kbd> to send, <kbd className="px-1.5 py-0.5 rounded bg-flow-surface text-flow-text text-[10px] font-mono">Shift+Enter</kbd> for new line
        </p>
      </form>
    </div>
  );
}

export default ChatInput;
