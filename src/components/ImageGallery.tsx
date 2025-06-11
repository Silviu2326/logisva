import React, { useState } from 'react';
import { X, Eye, Check, Maximize2 } from 'lucide-react';
import { ProcessingResult } from '../types';

interface ImageGalleryProps {
  images: File[];
  results: ProcessingResult[];
}

const ImageGallery: React.FC<ImageGalleryProps> = ({ images, results }) => {
  const [selectedImage, setSelectedImage] = useState<string | null>(null);
  
  const resultMap = results.reduce((acc, result) => {
    acc[result.fileName] = result;
    return acc;
  }, {} as Record<string, ProcessingResult>);

  const handleImageClick = (imageSrc: string) => {
    setSelectedImage(imageSrc);
  };

  const closeModal = () => {
    setSelectedImage(null);
  };

  return (
    <div className="card p-8">
      <div className="grid grid-cols-2 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 gap-6">
        {images.map((image, index) => {
          const imageUrl = URL.createObjectURL(image);
          const hasResults = resultMap[image.name] !== undefined;
          
          return (
            <div 
              key={index} 
              className="group relative aspect-square rounded-2xl overflow-hidden bg-gradient-to-br from-slate-100 to-slate-50 p-1"
            >
              <div className="absolute inset-0 bg-gradient-to-br from-slate-900/5 to-slate-900/30 rounded-xl z-10"></div>
              <img 
                src={imageUrl} 
                alt={image.name} 
                className="w-full h-full object-cover rounded-xl transition-all duration-700 group-hover:scale-110"
              />
              
              {hasResults && (
                <div className="absolute top-3 right-3 bg-teal-500 text-white rounded-full p-2 shadow-lg z-20 animate-pulse-slow">
                  <Check size={16} />
                </div>
              )}
              
              <div className="absolute inset-0 bg-gradient-to-t from-black/90 via-black/30 to-transparent opacity-0 group-hover:opacity-100 transition-all duration-500 flex items-end p-4 z-20">
                <div className="w-full flex items-end justify-between gap-4">
                  <span className="text-white text-sm font-medium truncate flex-1">
                    {image.name}
                  </span>
                  <button 
                    onClick={(e) => {
                      e.stopPropagation();
                      handleImageClick(imageUrl);
                    }}
                    className="p-2 bg-white/10 hover:bg-white/20 rounded-xl backdrop-blur-sm transition-colors group/btn"
                  >
                    <Maximize2 size={18} className="text-white transform group-hover/btn:scale-110 transition-transform" />
                  </button>
                </div>
              </div>
            </div>
          );
        })}
      </div>

      {selectedImage && (
        <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-8 backdrop-blur-lg">
          <div className="relative bg-white rounded-3xl overflow-hidden max-w-5xl w-full shadow-2xl">
            <div className="p-6 border-b flex justify-between items-center bg-gradient-to-r from-slate-50 to-white">
              <h3 className="font-semibold text-xl text-slate-800">Vista previa de imagen</h3>
              <button 
                onClick={closeModal}
                className="p-2 hover:bg-slate-100 rounded-xl transition-colors group"
              >
                <X size={24} className="text-slate-600 transform group-hover:rotate-90 transition-transform" />
              </button>
            </div>
            <div className="relative overflow-auto max-h-[80vh]">
              <img 
                src={selectedImage} 
                alt="Preview" 
                className="w-full h-full object-contain"
              />
            </div>
          </div>
        </div>
      )}
    </div>
  );
};

export default ImageGallery;