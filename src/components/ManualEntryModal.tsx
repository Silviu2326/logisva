import React, { useState, useEffect } from 'react';
import { X, ChevronLeft, ChevronRight, Save, SkipForward } from 'lucide-react';
import { ProcessingResult } from '../types';

interface ManualEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  failedResults: ProcessingResult[];
  images: File[];
  onSaveManualEntry: (fileName: string, checklistNumber: string) => void;
}

const ManualEntryModal: React.FC<ManualEntryModalProps> = ({
  isOpen,
  onClose,
  failedResults,
  images,
  onSaveManualEntry
}) => {
  const [currentIndex, setCurrentIndex] = useState(0);
  const [checklistNumber, setChecklistNumber] = useState('');
  const [isValid, setIsValid] = useState(false);

  const currentResult = failedResults[currentIndex];
  const currentImage = currentResult ? images.find(img => img.name === currentResult.fileName) : null;
  const imageUrl = currentImage ? URL.createObjectURL(currentImage) : null;

  useEffect(() => {
    // Validar que el número tenga entre 5 y 7 dígitos
    const isValidNumber = /^\d{5,7}$/.test(checklistNumber);
    setIsValid(isValidNumber);
  }, [checklistNumber]);

  useEffect(() => {
    // Limpiar el input cuando cambie la imagen
    setChecklistNumber('');
  }, [currentIndex]);

  const handleNext = () => {
    if (currentIndex < failedResults.length - 1) {
      setCurrentIndex(currentIndex + 1);
    }
  };

  const handlePrevious = () => {
    if (currentIndex > 0) {
      setCurrentIndex(currentIndex - 1);
    }
  };

  const handleSave = () => {
    if (isValid && currentResult) {
      onSaveManualEntry(currentResult.fileName, checklistNumber);
      setChecklistNumber('');
      if (currentIndex < failedResults.length - 1) {
        setCurrentIndex(currentIndex + 1);
      } else {
        onClose();
      }
    }
  };

  const handleSkip = () => {
    setChecklistNumber('');
    if (currentIndex < failedResults.length - 1) {
      setCurrentIndex(currentIndex + 1);
    } else {
      onClose();
    }
  };

  const handleKeyPress = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter' && isValid) {
      handleSave();
    } else if (e.key === 'Escape') {
      onClose();
    }
  };

  if (!isOpen || failedResults.length === 0) return null;

  return (
    <div className="fixed inset-0 bg-black/90 flex items-center justify-center z-50 p-4 backdrop-blur-lg">
      <div className="relative bg-white rounded-3xl overflow-hidden max-w-6xl w-full max-h-[90vh] shadow-2xl">
        {/* Header */}
        <div className="p-6 border-b bg-gradient-to-r from-slate-50 to-white flex justify-between items-center">
          <div>
            <h3 className="font-bold text-2xl text-slate-800">Entrada Manual de Checklist</h3>
            <p className="text-slate-600 mt-1">
              Imagen {currentIndex + 1} de {failedResults.length} • {currentResult?.fileName}
            </p>
          </div>
          <button 
            onClick={onClose}
            className="p-2 hover:bg-slate-100 rounded-xl transition-colors group"
          >
            <X size={24} className="text-slate-600 transform group-hover:rotate-90 transition-transform" />
          </button>
        </div>

        {/* Content */}
        <div className="flex flex-col lg:flex-row h-[calc(90vh-200px)]">
          {/* Image Section */}
          <div className="flex-1 p-6 flex items-center justify-center bg-slate-50">
            {imageUrl && (
              <div className="relative max-w-full max-h-full">
                <img 
                  src={imageUrl} 
                  alt={currentResult?.fileName}
                  className="max-w-full max-h-full object-contain rounded-xl shadow-lg"
                />
              </div>
            )}
          </div>

          {/* Input Section */}
          <div className="lg:w-96 p-6 border-l bg-white flex flex-col">
            <div className="flex-1">
              <h4 className="font-semibold text-lg text-slate-800 mb-4">
                Ingrese el número de checklist
              </h4>
              
              <div className="space-y-4">
                <div>
                  <label className="block text-sm font-medium text-slate-700 mb-2">
                    Número de Checklist (5-7 dígitos)
                  </label>
                  <input
                    type="text"
                    value={checklistNumber}
                    onChange={(e) => setChecklistNumber(e.target.value.replace(/\D/g, ''))}
                    onKeyDown={handleKeyPress}
                    placeholder="Ej: 123456"
                    className={`w-full px-4 py-3 border-2 rounded-xl text-lg font-mono transition-colors ${
                      checklistNumber === '' ? 'border-slate-200 focus:border-blue-500' :
                      isValid ? 'border-green-500 bg-green-50' : 'border-red-500 bg-red-50'
                    } focus:outline-none focus:ring-0`}
                    maxLength={7}
                    autoFocus
                  />
                  {checklistNumber && (
                    <p className={`text-sm mt-2 ${
                      isValid ? 'text-green-600' : 'text-red-600'
                    }`}>
                      {isValid ? '✅ Número válido' : '❌ Debe tener entre 5 y 7 dígitos'}
                    </p>
                  )}
                </div>

                <div className="bg-slate-50 p-4 rounded-xl">
                  <h5 className="font-medium text-slate-700 mb-2">Información del error:</h5>
                  <p className="text-sm text-slate-600">
                    {currentResult?.error || 'No se pudo extraer automáticamente el número de checklist'}
                  </p>
                </div>
              </div>
            </div>

            {/* Action Buttons */}
            <div className="space-y-3 mt-6">
              <button
                onClick={handleSave}
                disabled={!isValid}
                className={`w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium transition-all ${
                  isValid 
                    ? 'bg-green-500 hover:bg-green-600 text-white shadow-lg hover:shadow-xl transform hover:scale-105' 
                    : 'bg-slate-200 text-slate-400 cursor-not-allowed'
                }`}
              >
                <Save size={20} />
                Guardar y Continuar
              </button>
              
              <button
                onClick={handleSkip}
                className="w-full flex items-center justify-center gap-2 px-4 py-3 rounded-xl font-medium bg-slate-200 hover:bg-slate-300 text-slate-700 transition-colors"
              >
                <SkipForward size={20} />
                Omitir esta imagen
              </button>
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

          <div className="flex items-center gap-2">
            {failedResults.map((_, index) => (
              <div
                key={index}
                className={`w-3 h-3 rounded-full transition-colors ${
                  index === currentIndex ? 'bg-blue-500' : 'bg-slate-300'
                }`}
              />
            ))}
          </div>

          <button
            onClick={handleNext}
            disabled={currentIndex === failedResults.length - 1}
            className={`flex items-center gap-2 px-4 py-2 rounded-xl font-medium transition-colors ${
              currentIndex === failedResults.length - 1 
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

export default ManualEntryModal;