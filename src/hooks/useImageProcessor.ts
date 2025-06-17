import { useState } from 'react';
import { useState, useRef } from 'react';
import { ProcessingResult, BackendResponse } from '../types';
import JSZip from 'jszip';

interface ProgressData {
  type: 'progress' | 'image_completed' | 'completed' | 'error' | 'connected';
  stage: string;
  progress: number;
  message: string;
  currentImage?: number;
  fileName?: string;
  currentBatch?: number;
  totalBatches?: number;
  processedImages?: number;
  totalImages?: number;
  waitTime?: number;
  result?: {
    fileName: string;
    success: boolean;
    checklistNumber: string | null;
    error?: string;
  };
  results?: BackendResponse;
  error?: string;
  sessionId?: string;
}

export function useImageProcessor() {
  const [images, setImages] = useState<File[]>([]);
  const [isProcessing, setIsProcessing] = useState(false);
  const [progress, setProgress] = useState(0);
  const [progressMessage, setProgressMessage] = useState<string>('');
  const [currentStage, setCurrentStage] = useState<string>('');
  const [processedImages, setProcessedImages] = useState(0);
  const [totalImages, setTotalImages] = useState(0);
  const [results, setResults] = useState<ProcessingResult[]>([]);
  const eventSourceRef = useRef<EventSource | null>(null);
  const sessionIdRef = useRef<string>('');

  const uploadImages = (files: File[]) => {
    setImages(prevImages => [...prevImages, ...files]);
  };

  const clearImages = () => {
    setImages([]);
    setResults([]);
    setProgress(0);
    setProgressMessage('');
    setCurrentStage('');
    setProcessedImages(0);
    setTotalImages(0);
    
    // Cerrar conexión SSE si existe
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
      eventSourceRef.current = null;
    }
  };

  const processImages = async () => {
    if (images.length === 0) return;
    
    setIsProcessing(true);
    setProgress(0);
    setProgressMessage('Iniciando procesamiento...');
    setCurrentStage('starting');
    setProcessedImages(0);
    setTotalImages(images.length);
    
    // Generar ID de sesión único
    const sessionId = `session_${Date.now()}_${Math.random().toString(36).substr(2, 9)}`;
    sessionIdRef.current = sessionId;
    
    try {
      // Establecer conexión SSE para progreso en tiempo real
      const eventSource = new EventSource(`https://logisvaa-fa905005c15b.herokuapp.com/api/progress/${sessionId}`);
      eventSourceRef.current = eventSource;
      
      // Configurar manejadores de eventos SSE
      eventSource.onmessage = (event) => {
        try {
          const data: ProgressData = JSON.parse(event.data);
          
          switch (data.type) {
            case 'connected':
              console.log('Conexión SSE establecida:', data.sessionId);
              setProgressMessage('Conexión establecida, preparando envío...');
              break;
              
            case 'progress':
              setProgress(data.progress);
              setProgressMessage(data.message);
              setCurrentStage(data.stage);
              
              if (data.processedImages !== undefined) {
                setProcessedImages(data.processedImages);
              }
              if (data.totalImages !== undefined) {
                setTotalImages(data.totalImages);
              }
              break;
              
            case 'image_completed':
              setProgress(data.progress);
              setProgressMessage(data.message);
              setCurrentStage(data.stage);
              
              if (data.result) {
                console.log(`Imagen completada: ${data.result.fileName} - ${data.result.success ? 'Éxito' : 'Error'}`);
              }
              break;
              
            case 'completed':
              setProgress(100);
              setProgressMessage(data.message);
              setCurrentStage('completed');
              
              if (data.results) {
                // Transformar los resultados del backend al formato esperado
                const processedResults: ProcessingResult[] = data.results.results.map((result) => ({
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
                
                setResults(processedResults);
                
                // Log de estadísticas
                console.log(`Procesamiento completado:`);
                console.log(`- Total de imágenes: ${data.results.totalImages}`);
                console.log(`- Extracciones exitosas: ${data.results.successfulExtractions}`);
                console.log(`- Extracciones fallidas: ${data.results.failedExtractions}`);
                console.log(`- OCR tradicional exitoso: ${data.results.traditionalOcrSuccess}`);
                console.log(`- OpenAI exitoso: ${data.results.openaiSuccess}`);
              }
              
              // Cerrar conexión SSE
              eventSource.close();
              eventSourceRef.current = null;
              setIsProcessing(false);
              break;
              
            case 'error':
              console.error('Error en el procesamiento:', data.error);
              setProgressMessage(`Error: ${data.message}`);
              setCurrentStage('error');
              
              // Crear resultados de error para todas las imágenes
              const errorResults: ProcessingResult[] = images.map((image) => ({
                fileName: image.name,
                checklistNumber: null,
                success: false,
                error: data.error || 'Error desconocido',
                timestamp: new Date().toISOString(),
              }));
              
              setResults(errorResults);
              eventSource.close();
              eventSourceRef.current = null;
              setIsProcessing(false);
              break;
          }
        } catch (parseError) {
          console.error('Error parsing SSE data:', parseError);
        }
      };
      
      eventSource.onerror = (error) => {
        console.error('Error en conexión SSE:', error);
        setProgressMessage('Error en la conexión de progreso');
        eventSource.close();
        eventSourceRef.current = null;
      };
      
      // Esperar un momento para que se establezca la conexión SSE
      await new Promise(resolve => setTimeout(resolve, 1000));
      
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
      
      setProgressMessage('Enviando imágenes al servidor...');
      
      // Enviar al backend con el ID de sesión en los headers
      const response = await fetch('https://logisvaa-fa905005c15b.herokuapp.com/api/process-images', {
        method: 'POST',
        headers: {
          'X-Session-Id': sessionId,
        },
        body: formData,
      });
      
      if (!response.ok) {
        throw new Error(`Error del servidor: ${response.status}`);
      }
      
      // La respuesta final se manejará a través de SSE
      const data: BackendResponse = await response.json();
      console.log('Respuesta final del servidor:', data);
      
    } catch (error) {
      console.error('Error procesando imágenes:', error);
      
      // Cerrar conexión SSE si existe
      if (eventSourceRef.current) {
        eventSourceRef.current.close();
        eventSourceRef.current = null;
      }
      
      setProgressMessage(`Error: ${error instanceof Error ? error.message : 'Error desconocido'}`);
      setCurrentStage('error');
      
      // Crear resultados de error para todas las imágenes
      const errorResults: ProcessingResult[] = images.map((image) => ({
        fileName: image.name,
        checklistNumber: null,
        success: false,
        error: error instanceof Error ? error.message : 'Error desconocido',
        timestamp: new Date().toISOString(),
      }));
      
      setResults(errorResults);
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
    progressMessage,
    currentStage,
    processedImages,
    totalImages,
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