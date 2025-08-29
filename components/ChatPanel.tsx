
import React, { useRef, useEffect } from 'react';
import type { ChatMessage } from '../types';
import { Send, Paperclip, X } from 'lucide-react';

interface ChatPanelProps {
  history: ChatMessage[];
  userInput: string;
  onUserInput: (value: string) => void;
  onSendMessage: () => void;
  isLoading: boolean;
  onImageSelect: (file: File) => void;
  onImageRemove: () => void;
  selectedImagePreview: string | null;
}

export const ChatPanel: React.FC<ChatPanelProps> = ({ 
  history, 
  userInput, 
  onUserInput, 
  onSendMessage, 
  isLoading,
  onImageSelect,
  onImageRemove,
  selectedImagePreview 
}) => {
  const messagesEndRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const scrollToBottom = () => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  };

  useEffect(() => {
    scrollToBottom();
  }, [history]);

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      onSendMessage();
    }
  };

  const handleFileChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      onImageSelect(e.target.files[0]);
    }
    // Reset file input to allow selecting the same file again
    if (e.target) {
        e.target.value = '';
    }
  };

  return (
    <div className="flex flex-col h-full bg-gray-800/50">
      <div className="flex-grow p-4 overflow-y-auto space-y-4">
        {history.map((msg, index) => (
          <div key={index} className={`flex ${msg.role === 'user' ? 'justify-end' : 'justify-start'}`}>
            <div className={`max-w-xs md:max-w-md lg:max-w-xs xl:max-w-md rounded-lg px-4 py-2 ${msg.role === 'user' ? 'bg-cyan-600 text-white' : 'bg-gray-700 text-gray-200'}`}>
              {msg.imageUrl && (
                <img src={msg.imageUrl} alt="User upload" className="rounded-md mb-2 max-h-48 w-full object-contain" style={{ imageRendering: 'pixelated' }}/>
              )}
              {msg.content && <p className="text-sm whitespace-pre-wrap">{msg.content}</p>}
            </div>
          </div>
        ))}
        <div ref={messagesEndRef} />
      </div>
      <div className="p-4 border-t border-gray-700/50">
        {selectedImagePreview && (
            <div className="relative inline-block mb-2">
                <img src={selectedImagePreview} alt="Selected preview" className="h-20 w-20 object-cover rounded-md border-2 border-cyan-500" style={{ imageRendering: 'pixelated' }} />
                <button
                    onClick={onImageRemove}
                    className="absolute -top-2 -right-2 bg-gray-800 text-white rounded-full p-1 hover:bg-red-500 transition-colors"
                    aria-label="Remove image"
                    title="Remove image"
                >
                    <X className="w-4 h-4" />
                </button>
            </div>
        )}
        <div className="flex items-center bg-gray-700 rounded-lg">
          <input
            type="file"
            ref={fileInputRef}
            onChange={handleFileChange}
            accept="image/png, image/jpeg, image/webp"
            className="hidden"
            id="image-upload"
          />
           <button
            onClick={() => fileInputRef.current?.click()}
            disabled={isLoading || !!selectedImagePreview}
            className="p-3 text-gray-400 hover:text-cyan-400 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
            aria-label="Attach image"
            title="Attach an image"
          >
            <Paperclip className="w-5 h-5" />
          </button>
          <input
            type="text"
            className="flex-grow bg-transparent p-3 text-gray-100 placeholder-gray-400 focus:outline-none"
            placeholder={isLoading ? "Generating..." : selectedImagePreview ? "Add a description (optional)..." : "Describe your unit..."}
            value={userInput}
            onChange={(e) => onUserInput(e.target.value)}
            onKeyPress={handleKeyPress}
            disabled={isLoading}
          />
          <button
            onClick={onSendMessage}
            disabled={isLoading || (!userInput.trim() && !selectedImagePreview)}
            className="p-3 text-gray-400 hover:text-cyan-400 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
            title="Send message"
          >
            <Send className="w-5 h-5" />
          </button>
        </div>
      </div>
    </div>
  );
};
