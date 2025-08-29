
import React from 'react';

interface SpritePreviewProps {
  images?: { name: string; dataUrl: string }[];
  isLoading: boolean;
}

export const SpritePreview: React.FC<SpritePreviewProps> = ({ images, isLoading }) => {
  return (
    <div className="flex-grow flex items-center justify-center p-4 bg-gray-800/30 overflow-auto">
      {isLoading && (!images || images.length === 0) && (
        <div className="flex flex-col items-center gap-4 text-gray-400">
          <div className="animate-spin rounded-full h-12 w-12 border-b-2 border-cyan-400"></div>
          <p>Generating sprites...</p>
        </div>
      )}
      {!isLoading && (!images || images.length === 0) && (
        <div className="text-center text-gray-500">
          <p>Sprites will appear here once generated.</p>
        </div>
      )}
      {images && images.length > 0 && (
        <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 gap-4">
          {images.map((image, index) => (
            <div key={index} className="flex flex-col items-center gap-2 p-2 rounded-lg bg-gray-900/50 border border-gray-700/50">
              <img
                src={image.dataUrl}
                alt={`Generated Sprite: ${image.name}`}
                className="max-w-full max-h-24 object-contain"
                style={{ imageRendering: 'pixelated' }}
              />
              <p className="text-xs text-gray-400 font-mono bg-gray-700/50 px-2 py-0.5 rounded">{image.name}</p>
            </div>
          ))}
        </div>
      )}
    </div>
  );
};