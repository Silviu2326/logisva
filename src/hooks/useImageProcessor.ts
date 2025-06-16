import { useState } from 'react';
import { ProcessingResult, BackendResponse } from '../types';
import JSZip from 'jszip';


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
      images.forEach((image, index) => {
        console.log(`Adding image ${index}: ${image.name}, type: ${image.type}`);
        formData.append('images', image);
      });
      
      // Log FormData contents for debugging
      console.log('FormData entries:');
      for (let pair of formData.entries()) {
        console.log(pair[0], pair[1]);
      }
      
      // Simular progreso mientras se envía
      setProgress(25);
      
      // Enviar al backend - DO NOT set Content-Type header
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
        retryAttempt: result.retryAttempt,
        processingConfig: result.processingConfig,
        rotation: result.rotation,
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
          retryAttempt: r.retryAttempt,
          processingConfig: r.processingConfig,
          wasCropped: r.wasCropped,
          rotation: r.rotation,
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

  const exportImagesAsZip = async () => {
    if (results.length === 0 || images.length === 0) return;
    
    const zip = new JSZip();
    
    // Filtrar solo los resultados exitosos que tienen número de checklist
    const successfulResults = results.filter(r => r.success && r.checklistNumber);
    
    if (successfulResults.length === 0) {
      alert('No hay imágenes con números de checklist extraídos para exportar.');
      return;
    }
    
    // Agregar cada imagen al ZIP con el nombre del checklist
    for (const result of successfulResults) {
      const originalImage = images.find(img => img.name === result.fileName);
      if (originalImage) {
        const fileExtension = originalImage.name.split('.').pop() || 'jpg';
        const newFileName = `${result.checklistNumber}.${fileExtension}`;
        zip.file(newFileName, originalImage);
      }
    }
    
    try {
      // Generar el ZIP
      const content = await zip.generateAsync({ type: 'blob' });
      
      // Crear enlace de descarga
      const url = URL.createObjectURL(content);
      const a = document.createElement('a');
      a.href = url;
      a.download = `checklist-images-${new Date().toISOString().split('T')[0]}.zip`;
      document.body.appendChild(a);
      a.click();
      document.body.removeChild(a);
      URL.revokeObjectURL(url);
    } catch (error) {
      console.error('Error creando ZIP:', error);
      alert('Error al crear el archivo ZIP');
    }
  };

  const saveManualEntry = (fileName: string, checklistNumber: string) => {
    setResults(prevResults => 
      prevResults.map(result => 
        result.fileName === fileName 
          ? {
              ...result,
              success: true,
              checklistNumber,
              processingMethod: 'manual_entry',
              confidence: 100,
              error: undefined
            }
          : result
      )
    );
  };

  const updateChecklistNumber = (fileName: string, checklistNumber: string) => {
    setResults(prevResults => 
      prevResults.map(result => 
        result.fileName === fileName 
          ? {
              ...result,
              checklistNumber,
              success: true,
              error: undefined
            }
          : result
      )
    );
  };

  return {
    images,
    isProcessing,
    progress,
    results,
    uploadImages,
    processImages,
    clearImages,
    exportResults,
    exportImagesAsZip,
    saveManualEntry,
    updateChecklistNumber
  };
}