
import React, { useState, useMemo } from 'react';
import { Clipboard, Wand2, Send } from 'lucide-react';

interface CodeEditorProps {
  code: string;
  isLoading: boolean;
  onEdit: (instruction: string) => void;
}

const highlightIni = (code: string): React.ReactNode => {
    if (!code) return null;
  
    return code.split('\n').map((line, lineIndex) => {
      // Rule 1: Comment-only line
      const commentOnlyMatch = line.match(/^\s*(#.*)$/);
      if (commentOnlyMatch) {
        return <div key={lineIndex}><span className="token-comment">{line}</span></div>;
      }
  
      // Rule 2: Section-only line
      const sectionMatch = line.match(/^\s*(\[.+?\])\s*(#.*)?$/);
      if (sectionMatch) {
        const [, section, comment] = sectionMatch;
        return (
          <div key={lineIndex}>
            <span className="token-section">{section}</span>
            {comment && <span className="token-comment">{comment}</span>}
          </div>
        );
      }
  
      // Rule 3: Key-value pair with optional comment
      const kvMatch = line.match(/^(\s*)([a-zA-Z0-9_]+)(\s*:\s*)([^#]*)(\s*#.*)?$/);
      if (kvMatch) {
        const [, indent, key, separator, value, comment] = kvMatch;
        const trimmedValue = value.trim();
        let valueToken;
  
        if (trimmedValue !== '' && isFinite(Number(trimmedValue))) {
          valueToken = <span className="token-value-number">{value}</span>;
        } else if (trimmedValue === 'true' || trimmedValue === 'false') {
          valueToken = <span className="token-value-boolean">{value}</span>;
        } else {
          valueToken = <span className="token-value-string">{value}</span>;
        }
  
        return (
          <div key={lineIndex}>
            {indent}
            <span className="token-key">{key}</span>
            <span className="token-separator">{separator}</span>
            {valueToken}
            {comment && <span className="token-comment">{comment}</span>}
          </div>
        );
      }
  
      // Rule 4: Anything else is plain text
      return <div key={lineIndex}><span className="token-plain">{line}</span></div>;
    });
  };

export const CodeEditor: React.FC<CodeEditorProps> = ({ code, isLoading, onEdit }) => {
  const [copyText, setCopyText] = useState('Copy');
  const [editInstruction, setEditInstruction] = useState('');

  const highlightedCode = useMemo(() => highlightIni(code), [code]);

  const handleCopy = () => {
    if (code) {
      navigator.clipboard.writeText(code);
      setCopyText('Copied!');
      setTimeout(() => setCopyText('Copy'), 2000);
    }
  };
  
  const handleEditSubmit = () => {
      if (editInstruction.trim()) {
          onEdit(editInstruction);
          setEditInstruction('');
      }
  };

  const handleKeyPress = (e: React.KeyboardEvent<HTMLInputElement>) => {
    if (e.key === 'Enter' && !isLoading) {
      handleEditSubmit();
    }
  };

  return (
    <div className="flex flex-col h-full relative bg-gray-800/30">
        <div className="relative flex-grow overflow-auto">
            <button
                onClick={handleCopy}
                className="absolute top-2 right-2 bg-gray-700 hover:bg-cyan-600 text-gray-200 px-3 py-1 rounded-md text-xs z-10 transition-colors flex items-center gap-2"
            >
                <Clipboard className="w-3 h-3"/>
                {copyText}
            </button>
            <pre className="w-full h-full p-4 font-mono text-sm focus:outline-none absolute inset-0">
              <code>
                {isLoading && !code ? 'Generating code...' : code ? highlightedCode : 'INI code will appear here...'}
              </code>
            </pre>
        </div>
        
        {code && (
            <div className="p-3 border-t border-gray-700/50 bg-gray-900/50">
                 <label className="text-xs text-gray-400 flex items-center mb-2">
                    <Wand2 className="w-4 h-4 mr-2 text-cyan-400"/>
                    Edit with AI
                </label>
                <div className="flex items-center bg-gray-700 rounded-lg">
                    <input
                        type="text"
                        value={editInstruction}
                        onChange={(e) => setEditInstruction(e.target.value)}
                        onKeyPress={handleKeyPress}
                        disabled={isLoading}
                        placeholder="e.g., 'Make it faster and add more health'"
                        className="flex-grow bg-transparent p-2 text-gray-100 placeholder-gray-400 focus:outline-none text-sm"
                    />
                    <button
                        onClick={handleEditSubmit}
                        disabled={isLoading || !editInstruction.trim()}
                        className="p-2 text-gray-400 hover:text-cyan-400 disabled:text-gray-600 disabled:cursor-not-allowed transition-colors"
                        title="Send edit instruction"
                    >
                        <Send className="w-5 h-5"/>
                    </button>
                </div>
            </div>
        )}
    </div>
  );
};
