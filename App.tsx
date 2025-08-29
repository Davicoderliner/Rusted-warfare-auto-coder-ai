
import React, { useState, useCallback } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { SpritePreview } from './components/SpritePreview';
import { CodeEditor } from './components/CodeEditor';
import { generateUnit, editCodeWithGemini, generateModName } from './services/geminiService';
import type { ChatMessage, Mod } from './types';
import { Bot, Code2, Image as ImageIcon, Wind, Download, Package, Wand2, Send, X } from 'lucide-react';

// Make TypeScript aware of JSZip from the CDN script
declare var JSZip: any;

// A simple, placeholder 64x64px icon for the mod. It's a cyan gear.
const placeholderIconBase64 = 'iVBORw0KGgoAAAANSUhEUgAAAEAAAABACAYAAACqaXHeAAAAAXNSR0IArs4c6QAAAARnQU1BAACxjwv8YQUAAAAJcEhZcwAADsMAAA7DAcdvqGQAAARRSURBVHhe7ZxLyxtRFMfvTCEgCIIgCIKgSATxVETwJSIi6ANR8P8gCAoiiGAQEcEoiCCgKFgEVARRUBRRUBRBURRFERVFEBFFEAQRAUEUEUH8/ZZ7u2f3Zmd2d3ZndmfnD5/UNDPd99xzz525997ECEaYgTEbGAzMBiYDg4HZwGBgNjAZGAzMBgYDs4HZwGBgNjAZGAzMBgYDs4HZwGA4H2Aw3AMzDAbh0wzAGADMAEYMfhswAIbB+wyW3e2ACMDzDNYfA8zHj82xAZgBDPfADIPfBgyW3e2AEQLMh81xBgyW3e0AEQLMhwl+GzBYdrd7ADMAmF/uWACDAcB8kG0BDIcB5oPsg2EwAGAw3AMzDAbh0wzAGADMAEYMfhswAIbB+wyW3e2ACMDzDNYfA8zHj82xAZgBDPfADIPfBgyW3e2AEQLMh81xBgyW3e0AEQLMhwl+GzBYdrd7ADMAmF/uWACDAcB8kG0BDIcB5oPsg2EwAGAw3AMzDAbh0wzAGADMAEYMfhswAIbB+wyW3e2ACMDzDNYfA8zHj82xAZgBDPfADIPfBgyW3e2AEQLMh81xBgyW3e0AEQLMhwl+GzBYdrd7ADMAmF/uWACDAcB8kG0BDIcB5oPsg2EwAGBwhsE40L+2u+n9+2+P9u+9/mhn/9n3Rxv7t+4fbew/Of20/fP3b7d/uG0A9u/d/3q4fe/N7s+7x/Z/Ov1k//Dt7r/6uP375xXAZP8oYPA5f4dZ8O/c/qf9y92D/S+7r238/XwB8PtQ/+b6v+3e7pxt/vLgYwFMwEBgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwERgtwEDgV0GDIReBgwEdgsGErgMmAjsMmAgsMtgINBlwESY4R+t/yH9a/s3jEAAAAASUVORK5CYII=';

// Helper function to convert a base64 data URL to a Blob
const dataURLtoBlob = (dataurl: string): Blob | null => {
    const arr = dataurl.split(',');
    if (arr.length < 2) return null;
    const mimeMatch = arr[0].match(/:(.*?);/);
    if (!mimeMatch) return null;
    const mime = mimeMatch[1];
    const bstr = atob(arr[1]);
    let n = bstr.length;
    const u8arr = new Uint8Array(n);
    while (n--) {
        u8arr[n] = bstr.charCodeAt(n);
    }
    return new Blob([u8arr], { type: mime });
};


const App: React.FC = () => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'ai',
      content: "Welcome to the Rusted Warfare Auto-Coder! Let's build a mod. Describe the first unit you want to create.",
    },
  ]);
  const [userInput, setUserInput] = useState<string>('');
  const [currentMod, setCurrentMod] = useState<Mod | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEditingModName, setIsEditingModName] = useState<boolean>(false);
  const [modNameInput, setModNameInput] = useState<string>('');
  
  const latestUnit = currentMod?.units[currentMod.units.length - 1];

  const handleSendMessage = useCallback(async () => {
    if (!userInput.trim() || isLoading) return;

    const newUserMessage: ChatMessage = { role: 'user', content: userInput };
    setChatHistory(prev => [...prev, newUserMessage]);
    setUserInput('');
    setIsLoading(true);

    try {
      const result = await generateUnit(userInput);
      if (result) {
        setCurrentMod(prevMod => {
            const newMod = prevMod ?? { name: 'MyRustedMod', units: [] };
            return { ...newMod, units: [...newMod.units, result] };
        });

        const aiResponseMessage: ChatMessage = {
            role: 'ai',
            content: `I've generated the '${result.unitName}' unit and added it to your mod! You can describe another unit or download the mod folder.`,
        };
        setChatHistory(prev => [...prev, aiResponseMessage]);
      } else {
         throw new Error('Failed to get a valid response from the AI.');
      }
    } catch (e: any) {
      setChatHistory(prev => [...prev, { role: 'ai', content: `Sorry, I encountered an error. ${e.message}` }]);
    } finally {
      setIsLoading(false);
    }
  }, [userInput, isLoading]);
  
  const handleEditCode = useCallback(async (instruction: string) => {
    if (!instruction.trim() || !latestUnit || !currentMod || isLoading) return;

    const userEditMessage: ChatMessage = { role: 'user', content: `Can you modify the code for '${latestUnit.unitName}'? ${instruction}` };
    setChatHistory(prev => [...prev, userEditMessage]);
    setIsLoading(true);

    try {
        const updatedCode = await editCodeWithGemini(latestUnit.iniFile.content, instruction);

        // Update the latest unit in the mod state
        const updatedUnit = { ...latestUnit, iniFile: { ...latestUnit.iniFile, content: updatedCode } };
        const updatedUnits = [...currentMod.units.slice(0, -1), updatedUnit];
        setCurrentMod({ ...currentMod, units: updatedUnits });

        const aiEditResponseMessage: ChatMessage = {
            role: 'ai',
            content: "I've updated the code based on your request.",
        };
        setChatHistory(prev => [...prev, aiEditResponseMessage]);
        
    } catch (e: any) {
        setChatHistory(prev => [...prev, { role: 'ai', content: `Sorry, I couldn't edit the code. ${e.message}` }]);
    } finally {
        setIsLoading(false);
    }
}, [latestUnit, currentMod, isLoading]);

 const handleUpdateModName = useCallback(async () => {
    if (!modNameInput.trim() || !currentMod || isLoading) return;

    const userMessage: ChatMessage = { role: 'user', content: `Please rename the mod based on this suggestion: "${modNameInput}"` };
    setChatHistory(prev => [...prev, userMessage]);

    setIsLoading(true);
    setIsEditingModName(false);

    try {
        const newName = await generateModName(modNameInput, currentMod.name);
        setCurrentMod(prev => prev ? { ...prev, name: newName } : null);
        const aiMessage: ChatMessage = { role: 'ai', content: `Done! I've renamed the mod to '${newName}'.` };
        setChatHistory(prev => [...prev, aiMessage]);
        setModNameInput('');
    } catch (e: any) {
        setChatHistory(prev => [...prev, { role: 'ai', content: `Sorry, I couldn't rename the mod. ${e.message}` }]);
    } finally {
        setIsLoading(false);
    }
}, [modNameInput, currentMod, isLoading]);


  const handleDownload = () => {
    if (!currentMod || currentMod.units.length === 0) return;

    const zip = new JSZip();
    const modFolder = zip.folder(currentMod.name);

    if (!modFolder) {
        console.error("Failed to create zip folder.");
        return;
    }

    // Add icon.png for the mod
    const iconBlob = dataURLtoBlob(`data:image/png;base64,${placeholderIconBase64}`);
    if (iconBlob) {
        modFolder.file('icon.png', iconBlob);
    }

    // Add mod-info.ini
    const modInfoContent = `[core]
name: ${currentMod.name}
description: A custom mod generated by the Rusted Warfare Auto-Coder.

[graphics]
icon: icon.png
`;
    modFolder.file('mod-info.ini', modInfoContent.trim());

    // Add each unit in its own folder
    currentMod.units.forEach(unit => {
        const unitFolder = modFolder.folder(unit.unitName);
        if (unitFolder) {
            // Add INI file
            unitFolder.file(unit.iniFile.name, unit.iniFile.content);
            // Add image files
            unit.images.forEach(image => {
                const blob = dataURLtoBlob(image.dataUrl);
                if (blob) {
                    unitFolder.file(image.name, blob);
                }
            });
        }
    });

    zip.generateAsync({ type: 'blob' }).then(content => {
        const url = URL.createObjectURL(content);
        const link = document.createElement('a');
        link.href = url;
        link.download = `${currentMod.name}.zip`;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
    });
  };
  
  const canDownload = !!currentMod && currentMod.units.length > 0;

  return (
    <div className="bg-gray-900 text-gray-100 min-h-screen flex flex-col font-sans">
      <header className="bg-gray-950/70 backdrop-blur-sm border-b border-cyan-500/20 shadow-lg sticky top-0 z-10">
        <div className="container mx-auto px-4 py-3 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Wind className="text-cyan-400 h-8 w-8"/>
            <h1 className="text-xl font-bold tracking-wider text-gray-50">Rusted Warfare <span className="text-cyan-400">Auto-Coder</span></h1>
          </div>
          <div className="flex items-center gap-4">
             {currentMod && currentMod.units.length > 0 && (
                <div className="flex items-center gap-2 text-sm text-gray-300 bg-gray-800/50 px-3 py-1.5 rounded-md">
                    <Package className="w-4 h-4 text-cyan-400"/>
                     {isEditingModName ? (
                        <div className="flex items-center gap-1">
                            <span className="whitespace-nowrap">Rename Mod:</span>
                            <input 
                                type="text"
                                value={modNameInput}
                                onChange={(e) => setModNameInput(e.target.value)}
                                onKeyDown={(e) => { if (e.key === 'Enter') handleUpdateModName(); if (e.key === 'Escape') setIsEditingModName(false); }}
                                className="bg-gray-900 text-white px-2 py-1 rounded-md focus:outline-none focus:ring-1 focus:ring-cyan-500 text-sm w-36"
                                placeholder="e.g. 'Super Tanks Mod'"
                                autoFocus
                            />
                            <button 
                                onClick={handleUpdateModName} 
                                className="p-1.5 bg-cyan-600 text-white rounded-md hover:bg-cyan-500 disabled:bg-gray-600 disabled:cursor-not-allowed" 
                                disabled={isLoading || !modNameInput.trim()}
                                title="Generate new name"
                            >
                                <Send className="w-4 h-4" />
                            </button>
                             <button 
                                onClick={() => setIsEditingModName(false)} 
                                className="p-1.5 bg-gray-600 text-white rounded-md hover:bg-gray-500"
                                title="Cancel"
                            >
                                <X className="w-4 h-4" />
                            </button>
                        </div>
                    ) : (
                        <div className="flex items-center gap-2">
                            <span className="whitespace-nowrap">Mod: <span className="font-semibold text-white">{currentMod.name}</span></span>
                            <span className="text-gray-400">(<span className="font-semibold text-white">{currentMod.units.length}</span> unit{currentMod.units.length > 1 ? 's' : ''})</span>
                            <button 
                                onClick={() => { setIsEditingModName(true); setModNameInput(currentMod.name); }}
                                className="text-gray-400 hover:text-cyan-400 disabled:opacity-50"
                                title="Edit mod name with AI"
                                disabled={isLoading}
                            >
                                <Wand2 className="w-4 h-4"/>
                            </button>
                        </div>
                    )}
                </div>
             )}
            <button
                onClick={handleDownload}
                disabled={!canDownload}
                className="flex items-center gap-2 px-3 py-1.5 bg-cyan-600/50 hover:bg-cyan-600 disabled:bg-gray-700 disabled:text-gray-500 disabled:cursor-not-allowed text-white rounded-md text-sm transition-colors"
                title={canDownload ? "Download mod folder (.zip)" : "Generate a unit to enable download"}
            >
                <Download className="w-4 h-4" />
                Download Mod Folder
            </button>
            <a href="https://github.com/corrodinggames/rusted-warfare-docs/blob/master/Modding.md" target="_blank" rel="noopener noreferrer" className="text-sm text-gray-400 hover:text-cyan-400 transition-colors">Modding Docs</a>
          </div>
        </div>
      </header>

      <main className="flex-grow container mx-auto p-4 grid grid-cols-1 lg:grid-cols-10 gap-4 h-full">
        <div className="lg:col-span-3 flex flex-col bg-gray-950/50 rounded-lg border border-gray-700/50 overflow-hidden shadow-2xl">
           <div className="flex items-center p-3 border-b border-gray-700/50 bg-gray-900/50">
                <Bot className="h-6 w-6 mr-3 text-cyan-400" />
                <h2 className="text-lg font-semibold">AI Chat Assistant</h2>
            </div>
          <ChatPanel
            history={chatHistory}
            userInput={userInput}
            onUserInput={setUserInput}
            onSendMessage={handleSendMessage}
            isLoading={isLoading}
          />
        </div>

        <div className="lg:col-span-7 flex flex-col gap-4">
          <div className="flex-1 bg-gray-950/50 rounded-lg border border-gray-700/50 flex flex-col shadow-2xl">
            <div className="flex items-center p-3 border-b border-gray-700/50 bg-gray-900/50">
                <ImageIcon className="h-6 w-6 mr-3 text-cyan-400" />
                <h2 className="text-lg font-semibold">Generated Sprites {latestUnit && `for '${latestUnit.unitName}'`}</h2>
            </div>
            <SpritePreview images={latestUnit?.images} isLoading={isLoading} />
          </div>
          <div className="flex-1 bg-gray-950/50 rounded-lg border border-gray-700/50 flex flex-col shadow-2xl">
            <div className="flex items-center p-3 border-b border-gray-700/50 bg-gray-900/50">
                <Code2 className="h-6 w-6 mr-3 text-cyan-400" />
                <h2 className="text-lg font-semibold">Generated INI Code {latestUnit && `for '${latestUnit.unitName}'`}</h2>
            </div>
            <CodeEditor 
                code={latestUnit?.iniFile.content ?? ''} 
                isLoading={isLoading} 
                onEdit={handleEditCode} 
            />
          </div>
        </div>
      </main>
    </div>
  );
};

export default App;
