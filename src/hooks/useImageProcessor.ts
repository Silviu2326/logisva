import { useState } from 'react';
import { ProcessingResult, BackendResponse } from '../types';

export function useImageProcessor() {
  const [images, setImages] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [results, setResults] = useState<ProcessingResult[]>([]);

  const uploadImages = (files: File[]) => {
    setImages(prevImages => [...prevImages, ...files]);
  };

  const clearImages = () => {
    setImages([]);
    setResults([]);
    setProgress(0);
  };

  const processImages = async () => {
    if (images.length === 0) return;
    
    setIsProcessing(true);
    setProgress(0);
    
    try {
      // Crear FormData para enviar las imágenes
      const formData = new FormData();
      images.forEach((image) => {
        formData.append('images', image);
      });
      
      // Simular progreso mientras se envía
      setProgress(25);
      
      // Enviar al backend
      const response = await fetch('https://logisvaa-fa905005c15b.herokuapp.com/api/process-images', {
        method: 'POST',
        body: formData,
      });
      
      setProgress(50);
      
      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status}`);
      }
      
      const data: BackendResponse = await response.json();
      
      setProgress(75);
      
      // Transformar los resultados del backend al formato esperado
      const processedResults: ProcessingResult[] = data.results.map((result) => ({
        fileName: result.filename || 'Unknown',
        checklistNumber: result.checklistNumber,
        extractedText: result.extractedText,
        confidence: result.confidence,
        processingMethod: result.processingMethod,
        wasCropped: result.wasCropped,
        cropRegion: result.cropRegion,
        success: result.success,
        error: result.error,
        timestamp: new Date().toISOString(),
      }));
      
      setProgress(100);
      setResults(processedResults);
      
      // Log de estadísticas
      console.log(`Procesamiento completado:`);
      console.log(`- Total de imágenes: ${data.totalImages}`);
      console.log(`- Extracciones exitosas: ${data.successfulExtractions}`);
      console.log(`- Extracciones fallidas: ${data.failedExtractions}`);
      console.log(`- OCR tradicional exitoso: ${data.traditionalOcrSuccess}`);
      console.log(`- OpenAI exitoso: ${data.openaiSuccess}`);
      
    } catch (error) {
      console.error('Error procesando imágenes:', error);
      
      // Crear resultados de error para todas las imágenes
      const errorResults: ProcessingResult[] = images.map((image) => ({
        fileName: image.name,
        checklistNumber: null,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        timestamp: new Date().toISOString(),
      }));
      
      setResults(errorResults);
    } finally {
      setIsProcessing(false);
    }
  };

  const exportResults = () => {
    if (results.length === 0) return;
    
    // Crear un resumen de los resultados para exportar
    const exportData = {
      summary: {
        totalImages: results.length,
        successfulExtractions: results.filter(r => r.success).length,
        failedExtractions: results.filter(r => !r.success).length,
        traditionalOcrSuccess: results.filter(r => r.success && r.processingMethod !== 'openai_vision').length,
        openaiSuccess: results.filter(r => r.success && r.processingMethod === 'openai_vision').length,
        exportDate: new Date().toISOString(),
      },
      checklistNumbers: results
        .filter(r => r.success && r.checklistNumber)
        .map(r => ({
          fileName: r.fileName,
          checklistNumber: r.checklistNumber,
          processingMethod: r.processingMethod,
          confidence: r.confidence,
        })),
      detailedResults: results,
    };
    
    // Crear blob JSON y descargarlo
    const dataStr = JSON.stringify(exportData, null, 2);
    const blob = new Blob([dataStr], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    
    const a = document.createElement('a');
    a.href = url;
    a.download = `checklist-extraction-results-${new Date().toISOString().split('T')[0]}.json`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  return {
    images,
    isProcessing,
    progress,
    results,
    uploadImages,
    processImages,
    clearImages,
    exportResults
  };
}