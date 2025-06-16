import React, { useState, useEffect, useRef } from 'react';
import { X, ChevronLeft, ChevronRight, Save, Edit3, Check, ZoomIn, ZoomOut, RotateCcw } from 'lucide-react';
import { ProcessingResult } from '../types';

interface ReviewModalProps {
  isOpen: boolean;
  onClose: () => void;
  results: ProcessingResult[];
  images: File[];
  onUpdateChecklistNumber: (fileName: string, checklistNumber: string) => void;
}

const ReviewModal: React.FC<ReviewModalProps> = ({
  isOpen,
  onClose,
  results,
  images,
  onUpdateChecklistNumber
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [editingIndex, setEditingIndex] = useState<number | null>(null);
  const [tempChecklistNumber, setTempChecklistNumber] = useState('');
  const [isValid, setIsValid] = useState(false);
  const [zoom, setZoom] = useState(1);
  const [panX, setPanX] = useState(0);
  const [panY, setPanY] = useState(0);
  const [isDragging, setIsDragging] = useState(false);
  const [dragStart, setDragStart] = useState({ x: 0, y: 0 });
  const imageRef = useRef<HTMLImageElement>(null);
  const containerRef = useRef<HTMLDivElement>(null);

  const currentResult = results[currentIndex];
  const currentImage = currentResult ? images.find(img => img.name === currentResult.fileName) : null;
  const imageUrl = currentImage ? URL.createObjectURL(currentImage) : null;

  useEffect(() => {
    // Validar que el número tenga entre 5 y 7 dígitos
    const isValidNumber = /^\d{5,7}$/.test(tempChecklistNumber);
    setIsValid(isValidNumber);
  }, [tempChecklistNumber]);

  useEffect(() => {
    // Resetear edición y zoom cuando cambie la imagen
    setEditingIndex(null);
    setTempChecklistNumber('');
    setZoom(1);
    setPanX(0);
    setPanY(0);
  }, [currentIndex]);

  const handleZoomIn = () => {
    setZoom(prev => Math.min(prev * 1.5, 5));
  };

  const handleZoomOut = () => {
    setZoom(prev => Math.max(prev / 1.5, 0.5));
  };

  const handleResetZoom = () => {
    setZoom(1);
    setPanX(0);
    setPanY(0);
  };

  const handleWheel = (e: React.WheelEvent) => {
    e.preventDefault();
    const delta = e.deltaY > 0 ? 0.9 : 1.1;
    setZoom(prev => Math.min(Math.max(prev * delta, 0.5), 5));
  };

  const handleMouseDown = (e: React.MouseEvent) => {
    if (zoom > 1) {
      setIsDragging(true);
      setDragStart({ x: e.clientX - panX, y: e.clientY - panY });
    }
  };

  const handleMouseMove = (e: React.MouseEvent) => {
    if (isDragging && zoom > 1) {
      setPanX(e.clientX - dragStart.x);
      setPanY(e.clientY - dragStart.y);
    }
  };

  const handleMouseUp = () => {
    setIsDragging(false);
  };

  const handleNext = () => {
    if (currentIndex < results.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleStartEdit = () => {
    setEditingIndex(currentIndex);
    setTempChecklistNumber(currentResult?.checklistNumber || '');
  };

  const handleCancelEdit = () => {
    setEditingIndex(null);
    setTempChecklistNumber('');
  };

  const handleSaveEdit = () => {
    if (isValid && currentResult) {
      onUpdateChecklistNumber(currentResult.fileName, tempChecklistNumber);
      setEditingIndex(null);
      setTempChecklistNumber('');
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid) {
      handleSaveEdit();
    } else if (e.key === 'Escape') {
      if (editingIndex !== null) {
        handleCancelEdit();
      } else {
        onClose();
      }
    }
  };

  const getStatusBadge = (result: ProcessingResult) => {
    if (!result.success) {
      return (
        <span className="bg-red-100 text-red-800 px-2 py-1 rounded-full text-xs font-medium">
          ❌ Fallido
        </span>
      );
    }
    
    const methodColors = {
      'mistral_ocr': 'bg-purple-100 text-purple-800',
      'openai_vision': 'bg-blue-100 text-blue-800',
      'manual_entry': 'bg-yellow-100 text-yellow-800',
      'traditional_ocr': 'bg-green-100 text-green-800'
    };
    
    const color = methodColors[result.processingMethod as keyof typeof methodColors] || 'bg-gray-100 text-gray-800';
    
    return (
      <span className={`${color} px-2 py-1 rounded-full text-xs font-medium`}>
        ✅ {result.processingMethod === 'manual_entry' ? 'Manual' : 
            result.processingMethod === 'mistral_ocr' ? 'Mistral' :
            result.processingMethod === 'openai_vision' ? 'OpenAI' : 'OCR'}
      </span>
    );
  };

  if (!isOpen || results.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-lg">
      <div className="relative bg-white rounded-3xl overflow-hidden max-w-7xl w-full max-h-[95vh] shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-slate-50 to-white flex justify-between items-center">
          <div>
            <h3 className="font-bold text-2xl text-slate-800">Modo Revisión - Todas las Imágenes</h3>
            <p className="text-slate-600 mt-1">
              Imagen {currentIndex + 1} de {results.length} • {currentResult?.fileName}
            </p>
            <div className="flex items-center gap-3 mt-2">
              {getStatusBadge(currentResult)}
              {currentResult?.retryAttempt && (
                <span className="bg-blue-50 text-blue-700 px-2 py-1 rounded-full text-xs font-medium">
                  Intento {currentResult.retryAttempt}
                </span>
              )}
              {currentResult?.confidence && (
                <span className="bg-slate-100 text-slate-700 px-2 py-1 rounded-full text-xs font-medium">
                  {currentResult.confidence}% confianza
                </span>
              )}
            </div>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors group"
          >
            <X size={24} className="text-slate-600 transform group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        {/* Content */}
         <div className="flex flex-col lg:flex-row h-[calc(95vh-200px)]">
           {/* Image Section with zoom */}
           <div className="lg:w-1/2 flex flex-col bg-slate-50">
            {/* Controles de zoom */}
            <div className="flex items-center justify-center gap-2 p-2 bg-white border-b">
              <button
                onClick={handleZoomOut}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                title="Alejar"
              >
                <ZoomOut className="w-4 h-4" />
              </button>
              <span className="text-sm text-gray-600 min-w-[60px] text-center">
                {Math.round(zoom * 100)}%
              </span>
              <button
                onClick={handleZoomIn}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors"
                title="Acercar"
              >
                <ZoomIn className="w-4 h-4" />
              </button>
              <button
                onClick={handleResetZoom}
                className="p-2 text-gray-600 hover:text-gray-800 hover:bg-gray-100 rounded transition-colors ml-2"
                title="Restablecer zoom"
              >
                <RotateCcw className="w-4 h-4" />
              </button>
            </div>
            
            {/* Contenedor de imagen */}
            <div 
              ref={containerRef}
              className="flex-1 flex items-center justify-center p-6 overflow-hidden"
              onWheel={handleWheel}
              onMouseDown={handleMouseDown}
              onMouseMove={handleMouseMove}
              onMouseUp={handleMouseUp}
              onMouseLeave={handleMouseUp}
              style={{ cursor: zoom > 1 ? (isDragging ? 'grabbing' : 'grab') : 'default' }}
            >
              {imageUrl && (
                <img
                  ref={imageRef}
                  src={imageUrl}
                  alt={currentResult?.fileName}
                  className="max-w-none rounded-xl shadow-lg select-none"
                  style={{
                    transform: `scale(${zoom}) translate(${panX / zoom}px, ${panY / zoom}px)`,
                    transformOrigin: 'center center',
                    transition: isDragging ? 'none' : 'transform 0.1s ease-out'
                  }}
                  draggable={false}
                />
              )}
            </div>
          </div>

          {/* Info and Edit Section */}
          <div className="lg:w-1/2 p-6 border-l bg-white flex flex-col">
            <div className="flex-1">
              <h4 className="font-semibold text-lg text-slate-800 mb-4">
                Información del Checklist
              </h4>
              
              <div className="space-y-4">
                {/* Checklist Number Section - Destacada */}
                <div className="mb-8 p-4 bg-blue-50 rounded-lg border border-blue-200">
                  <div className="flex items-center justify-between mb-3">
                    <label className="text-base font-semibold text-blue-800">
                      Número de Checklist
                    </label>
                    {editingIndex !== currentIndex && (
                       <button
                         onClick={() => handleStartEdit(currentIndex)}
                         className="bg-blue-600 text-white px-3 py-1.5 rounded-md hover:bg-blue-700 text-sm flex items-center gap-1 transition-colors"
                       >
                         <Edit3 className="w-3 h-3" />
                         Editar
                       </button>
                     )}
                  </div>
                  
                  {editingIndex === currentIndex ? (
                    <div className="space-y-4">
                      <input
                        type="text"
                        value={tempChecklistNumber}
                        onChange={(e) => setTempChecklistNumber(e.target.value.replace(/\D/g, ''))}
                        onKeyDown={handleKeyPress}
                        placeholder="Ingrese número de checklist (5-7 dígitos)"
                        className={`w-full px-4 py-3 border-2 rounded-lg text-lg font-mono focus:ring-2 focus:ring-blue-500 focus:border-blue-500 ${
                          isValid ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                        }`}
                        maxLength={7}
                        autoFocus
                      />
                      {tempChecklistNumber && (
                        <p className={`text-sm ${
                          isValid ? 'text-green-600' : 'text-red-600'
                        }`}>
                          {isValid ? '✅ Número válido' : '❌ Debe tener entre 5 y 7 dígitos'}
                        </p>
                      )}
                      <div className="flex gap-3">
                        <button
                          onClick={handleSaveEdit}
                          disabled={!isValid}
                          className="flex-1 bg-green-600 text-white px-4 py-3 rounded-lg hover:bg-green-700 disabled:opacity-50 disabled:cursor-not-allowed flex items-center justify-center gap-2 font-medium transition-colors"
                        >
                          <Check className="w-4 h-4" />
                          Guardar
                        </button>
                        <button
                          onClick={handleCancelEdit}
                          className="flex-1 bg-gray-500 text-white px-4 py-3 rounded-lg hover:bg-gray-600 font-medium transition-colors"
                        >
                          Cancelar
                        </button>
                      </div>
                    </div>
                  ) : (
                    <div className="bg-white p-4 rounded-lg border border-blue-300 shadow-sm">
                      <span className="text-2xl font-mono font-bold text-blue-800">
                        {currentResult?.checklistNumber || 'No detectado'}
                      </span>
                    </div>
                  )}
                </div>

                {/* Processing Details */}
                <div className="bg-slate-50 p-4 rounded-xl space-y-3">
                  <h5 className="font-medium text-slate-700">Detalles del Procesamiento:</h5>
                  
                  <div className="space-y-2 text-sm">
                    <div className="flex justify-between">
                      <span className="text-slate-600">Estado:</span>
                      <span className={currentResult?.success ? 'text-green-600 font-medium' : 'text-red-600 font-medium'}>
                        {currentResult?.success ? 'Exitoso' : 'Fallido'}
                      </span>
                    </div>
                    
                    {currentResult?.processingMethod && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Método:</span>
                        <span className="text-slate-800 font-medium">
                          {currentResult.processingMethod === 'manual_entry' ? 'Entrada Manual' :
                           currentResult.processingMethod === 'mistral_ocr' ? 'Mistral OCR' :
                           currentResult.processingMethod === 'openai_vision' ? 'OpenAI Vision' : 'OCR Tradicional'}
                        </span>
                      </div>
                    )}
                    
                    {currentResult?.retryAttempt && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Intento:</span>
                        <span className="text-slate-800 font-medium">{currentResult.retryAttempt}</span>
                      </div>
                    )}
                    
                    {currentResult?.processingConfig && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Configuración:</span>
                        <span className="text-slate-800 font-medium">{currentResult.processingConfig}</span>
                      </div>
                    )}
                    
                    {currentResult?.confidence && (
                      <div className="flex justify-between">
                        <span className="text-slate-600">Confianza:</span>
                        <span className="text-slate-800 font-medium">{currentResult.confidence}%</span>
                      </div>
                    )}
                  </div>
                  
                  {currentResult?.error && (
                    <div className="mt-3 p-3 bg-red-50 rounded-lg">
                      <p className="text-sm text-red-600">
                        <strong>Error:</strong> {currentResult.error}
                      </p>
                    </div>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>

        {/* Navigation Footer */}
        <div className="p-4 border-t bg-slate-50 flex justify-between items-center">
          <button
            onClick={handlePrevious}
            disabled={currentIndex === 0}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
              currentIndex === 0 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                : 'bg-white hover:bg-slate-100 text-slate-700 shadow-sm'
            }`}
          >
            <ChevronLeft size={20} />
            Anterior
          </button>

          <div className="flex items-center gap-2 max-w-md overflow-x-auto">
            {results.map((result, index) => (
              <button
                key={index}
                onClick={() => setCurrentIndex(index)}
                className={`w-3 h-3 rounded-full transition-colors flex-shrink-0 ${
                  index === currentIndex ? 'bg-blue-500' : 
                  result.success ? 'bg-green-300' : 'bg-red-300'
                }`}
                title={`${result.fileName} - ${result.success ? 'Exitoso' : 'Fallido'}`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            disabled={currentIndex === results.length - 1}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
              currentIndex === results.length - 1 
                ? 'bg-slate-200 text-slate-400 cursor-not-allowed' 
                : 'bg-white hover:bg-slate-100 text-slate-700 shadow-sm'
            }`}
          >
            Siguiente
            <ChevronRight size={20} />
          </button>
        </div>
      </div>
    </div>
  );
};

export default ReviewModal;