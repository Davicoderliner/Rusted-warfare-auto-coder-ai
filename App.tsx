
import React, { useState, useCallback } from 'react';
import { ChatPanel } from './components/ChatPanel';
import { SpritePreview } from './components/SpritePreview';
import { CodeEditor } from './components/CodeEditor';
import { generateUnit, editCodeWithGemini, generateModName, generateUnitFromImage } from './services/geminiService';
import type { ChatMessage, Mod } from './types';
import { Bot, Code2, Image as ImageIcon, Wind, Download, Package, Wand2, Send, X, Paperclip, Music } from 'lucide-react';

// Make TypeScript aware of JSZip from the CDN script
declare var JSZip: any;

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

// Helper function to resize an image client-side
const resizeImage = (file: File, maxSize: number): Promise<string> => {
    return new Promise((resolve, reject) => {
        const reader = new FileReader();
        reader.readAsDataURL(file);
        reader.onload = (event) => {
            if (!event.target?.result) return reject(new Error("Could not read file"));
            const img = new Image();
            img.src = event.target.result as string;
            img.onload = () => {
                const canvas = document.createElement('canvas');
                let { width, height } = img;

                if (width > height) {
                    if (width > maxSize) {
                        height = Math.round(height * (maxSize / width));
                        width = maxSize;
                    }
                } else {
                    if (height > maxSize) {
                        width = Math.round(width * (maxSize / height));
                        height = maxSize;
                    }
                }

                canvas.width = width;
                canvas.height = height;
                const ctx = canvas.getContext('2d');
                if (!ctx) return reject(new Error("Could not get canvas context"));
                
                ctx.imageSmoothingEnabled = false;
                ctx.drawImage(img, 0, 0, width, height);
                
                resolve(canvas.toDataURL(file.type));
            };
            img.onerror = reject;
        };
        reader.onerror = reject;
    });
};


const App: React.FC = () => {
  const [chatHistory, setChatHistory] = useState<ChatMessage[]>([
    {
      role: 'ai',
      content: "Welcome to the Rusted Warfare Auto-Coder! Let's build a mod. Describe the first unit you want to create, or upload an image or sound file to start.",
    },
  ]);
  const [userInput, setUserInput] = useState<string>('');
  const [selectedImage, setSelectedImage] = useState<{dataUrl: string; file: File} | null>(null);
  const [selectedAudio, setSelectedAudio] = useState<{dataUrl: string; file: File} | null>(null);
  const [currentMod, setCurrentMod] = useState<Mod | null>(null);
  const [isLoading, setIsLoading] = useState<boolean>(false);
  const [isEditingModName, setIsEditingModName] = useState<boolean>(false);
  const [modNameInput, setModNameInput] = useState<string>('');
  const [isAutoFixEnabled, setIsAutoFixEnabled] = useState<boolean>(true);
  
  const latestUnit = currentMod?.units[currentMod.units.length - 1];

  const handleImageSelect = useCallback(async (file: File) => {
    if (!file.type.startsWith('image/')) return;
    setIsLoading(true);
    try {
        const dataUrl = await resizeImage(file, 128); // Resize to 128x128 max
        setSelectedImage({ dataUrl, file });
    } catch (error) {
        console.error("Error resizing image:", error);
        setChatHistory(prev => [...prev, { role: 'ai', content: "Sorry, I couldn't process that image. It might be corrupted or in an unsupported format. Please try another one." }]);
    } finally {
        setIsLoading(false);
    }
  }, []);

  const handleAudioSelect = useCallback((file: File) => {
    if (!file.type.startsWith('audio/')) return;
    const reader = new FileReader();
    reader.onload = (event) => {
        if (event.target?.result) {
            setSelectedAudio({ dataUrl: event.target.result as string, file });
        }
    };
    reader.readAsDataURL(file);
  }, []);

  const handleImageRemove = useCallback(() => {
    setSelectedImage(null);
  }, []);

  const handleAudioRemove = useCallback(() => {
    setSelectedAudio(null);
  }, []);

  const handleSendMessage = useCallback(async () => {
    if ((!userInput.trim() && !selectedImage && !selectedAudio) || isLoading) return;

    const newUserMessage: ChatMessage = { 
        role: 'user', 
        content: userInput,
        imageUrl: selectedImage?.dataUrl,
        audioUrl: selectedAudio?.dataUrl,
    };
    setChatHistory(prev => [...prev, newUserMessage]);

    const imageToProcess = selectedImage;
    const audioToProcess = selectedAudio;
    setUserInput('');
    setSelectedImage(null);
    setSelectedAudio(null);
    setIsLoading(true);

    try {
      let result;
      const existingUnitNames = currentMod?.units.map(u => u.unitName) ?? [];

      if (imageToProcess) {
          const base64Data = imageToProcess.dataUrl.split(',')[1];
          result = await generateUnitFromImage(userInput, base64Data, imageToProcess.file.type, isAutoFixEnabled);
      } else {
          const audioPayload = audioToProcess ? {
              dataUrl: audioToProcess.dataUrl,
              mimeType: audioToProcess.file.type
          } : undefined;
          result = await generateUnit(userInput, audioPayload, existingUnitNames, isAutoFixEnabled);
      }
      
      if (result) {
        setCurrentMod(prevMod => {
            const newMod = prevMod ?? { name: 'MyRustedMod', units: [] };
            return { ...newMod, units: [...newMod.units, result] };
        });

        const aiResponseMessage: ChatMessage = {
            role: 'ai',
            content: `I've generated the '${result.unitName}' unit and added it to your mod! You can describe another unit, upload another attachment, or download the mod folder.`,
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
  }, [userInput, isLoading, selectedImage, selectedAudio, currentMod, isAutoFixEnabled]);
  
  const handleEditCode = useCallback(async (instruction: string) => {
    if (!instruction.trim() || !latestUnit || !currentMod || isLoading) return;

    const userEditMessage: ChatMessage = { role: 'user', content: `Can you modify the code for '${latestUnit.unitName}'? ${instruction}` };
    setChatHistory(prev => [...prev, userEditMessage]);
    setIsLoading(true);

    try {
        const existingUnitNames = currentMod.units.map(u => u.unitName);
        const updatedCode = await editCodeWithGemini(latestUnit.iniFile.content, instruction, existingUnitNames, isAutoFixEnabled);

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
}, [latestUnit, currentMod, isLoading, isAutoFixEnabled]);

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

    // Add mod-info.txt
    const modInfoContent = `[mod]
title: ${currentMod.name}
description: A custom mod generated by the Rusted Warfare Auto-Coder.
version: 1.0
minVersion: 1.14
`;
    modFolder.file('mod-info.txt', modInfoContent.trim());

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
             // Add sound files
            if (unit.sounds) {
                unit.sounds.forEach(sound => {
                    const blob = dataURLtoBlob(sound.dataUrl);
                    if (blob) {
                        unitFolder.file(sound.name, blob);
                    }
                });
            }
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
            <div className="flex items-center gap-2" title="When enabled, the AI will automatically correct generated code for common errors.">
                <label htmlFor="auto-fix-toggle" className="text-sm font-medium text-gray-300 cursor-pointer select-none">
                    Auto-Fix
                </label>
                <button
                    id="auto-fix-toggle"
                    role="switch"
                    aria-checked={isAutoFixEnabled}
                    onClick={() => setIsAutoFixEnabled(prev => !prev)}
                    className={`${
                        isAutoFixEnabled ? 'bg-cyan-500' : 'bg-gray-600'
                    } relative inline-flex h-6 w-11 flex-shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors duration-200 ease-in-out focus:outline-none focus:ring-2 focus:ring-cyan-500 focus:ring-offset-2 focus:ring-offset-gray-900`}
                >
                    <span
                        aria-hidden="true"
                        className={`${
                            isAutoFixEnabled ? 'translate-x-5' : 'translate-x-0'
                        } pointer-events-none inline-block h-5 w-5 transform rounded-full bg-white shadow ring-0 transition duration-200 ease-in-out`}
                    />
                </button>
            </div>
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
            onImageSelect={handleImageSelect}
            onImageRemove={handleImageRemove}
            selectedImagePreview={selectedImage?.dataUrl ?? null}
            onAudioSelect={handleAudioSelect}
            onAudioRemove={handleAudioRemove}
            selectedAudioPreview={selectedAudio?.dataUrl ?? null}
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
