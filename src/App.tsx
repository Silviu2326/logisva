import React, { useState } from 'react';
import { UploadCloud } from 'lucide-react';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import ImageGallery from './components/ImageGallery';
import ProcessingPanel from './components/ProcessingPanel';
import ManualEntryModal from './components/ManualEntryModal';
import ReviewModal from './components/ReviewModal';
import { useImageProcessor } from './hooks/useImageProcessor';

function App() {
  const [isManualEntryModalOpen, setIsManualEntryModalOpen] = useState(false);
  const [isReviewModalOpen, setIsReviewModalOpen] = useState(false);
  
  const {
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
  } = useImageProcessor();

  const failedResults = results.filter(r => !r.success);

  const handleOpenManualEntry = () => {
    if (failedResults.length > 0) {
      setIsManualEntryModalOpen(true);
    }
  };

  const handleOpenReview = () => {
    if (results.length > 0) {
      setIsReviewModalOpen(true);
    }
  };

  return (
    <div className="min-h-screen bg-gradient-to-br from-slate-50 to-slate-100 flex flex-col">
      <Header />
      
      <main className="flex-1 container mx-auto px-6 py-12 max-w-7xl">
        {images.length === 0 ? (
          <div className="flex flex-col items-center justify-center min-h-[70vh]">
            <div className="text-center mb-16 max-w-3xl">
              <h2 className="text-5xl font-bold mb-6 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-clip-text text-transparent">
                Bienvenido al Extractor de Checklists
              </h2>
              <p className="text-xl text-slate-600">
                Sube una carpeta de imágenes para comenzar a extraer información de tus checklists
              </p>
            </div>
            <UploadZone onUpload={uploadImages} />
          </div>
        ) : (
          <div className="space-y-8">
            <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-8">
              <div>
                <h2 className="text-4xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-clip-text text-transparent mb-3">
                  Imágenes Cargadas
                </h2>
                <p className="text-xl text-slate-600">{images.length} imágenes listas para procesar</p>
              </div>
              <div className="flex gap-4">
                <button 
                  onClick={clearImages}
                  className="btn-secondary"
                >
                  Limpiar todo
                </button>
                <button 
                  onClick={processImages}
                  disabled={isProcessing || images.length === 0}
                  className="btn-primary"
                >
                  {isProcessing ? (
                    <>
                      <span className="h-5 w-5 rounded-full border-3 border-white border-t-transparent animate-spin"></span>
                      Procesando...
                    </>
                  ) : (
                    <>
                      <UploadCloud size={22} className="transform group-hover:rotate-6 transition-transform" />
                      Procesar imágenes
                    </>
                  )}
                </button>
              </div>
            </div>
            
            {isProcessing ? (
              <ProcessingPanel progress={progress} />
            ) : (
              <ImageGallery images={images} results={results} />
            )}
            
            {results.length > 0 && !isProcessing && (
              <div className="card p-8">
                <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-6 mb-8">
                  <div>
                    <h3 className="text-3xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-clip-text text-transparent">
                      Resultados del Procesamiento
                    </h3>
                    <div className="flex flex-wrap gap-4 mt-3">
                      <div className="bg-green-100 text-green-800 px-3 py-1 rounded-full text-sm font-medium">
                        ✅ Exitosos: {results.filter(r => r.success).length}
                      </div>
                      <div className="bg-red-100 text-red-800 px-3 py-1 rounded-full text-sm font-medium">
                        ❌ Fallidos: {results.filter(r => !r.success).length}
                      </div>
                      <div className="bg-blue-100 text-blue-800 px-3 py-1 rounded-full text-sm font-medium">
                        📊 Total: {results.length}
                      </div>
                      <div className="bg-purple-100 text-purple-800 px-3 py-1 rounded-full text-sm font-medium">
                        🤖 Mistral OCR: {results.filter(r => r.success && r.processingMethod === 'mistral_ocr').length}
                      </div>
                      <div className="bg-orange-100 text-orange-800 px-3 py-1 rounded-full text-sm font-medium">
                        🔍 OCR Tradicional: {results.filter(r => r.success && r.processingMethod !== 'mistral_ocr' && r.processingMethod !== 'openai_vision').length}
                      </div>
                    </div>
                  </div>
                  <div className="flex gap-3">
                    {results.length > 0 && (
                      <button 
                        onClick={handleOpenReview}
                        className="bg-indigo-500 hover:bg-indigo-600 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2"
                      >
                        🔍 Modo Revisión
                      </button>
                    )}
                    {failedResults.length > 0 && (
                      <button 
                        onClick={handleOpenManualEntry}
                        className="bg-yellow-500 hover:bg-yellow-600 text-white px-4 py-2 rounded-xl font-medium transition-colors flex items-center gap-2"
                      >
                        ✏️ Entrada Manual ({failedResults.length})
                      </button>
                    )}
                    <button 
                      onClick={exportResults}
                      className="btn-primary"
                    >
                      Exportar resultados
                    </button>
                    <button 
                      onClick={exportImagesAsZip}
                      className="btn-secondary"
                    >
                      Exportar ZIP con imágenes
                    </button>
                  </div>
                </div>
                <div className="overflow-auto max-h-96 rounded-2xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-gradient-to-r from-slate-50 to-white">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Imagen
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Número de Checklist
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Intento
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Configuración
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Método
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Estado
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Error
                        </th>
                      </tr>
                    </thead>
                    <tbody className="bg-white divide-y divide-slate-200">
                      {results.map((result, index) => (
                        <tr key={index} className="hover:bg-slate-50 transition-colors">
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900 font-medium">
                            {result.fileName}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-900">
                            {result.checklistNumber || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {result.retryAttempt ? (
                              <span className={`px-2 py-1 text-xs font-semibold rounded-full ${
                                result.retryAttempt === 1 ? 'bg-green-100 text-green-800' :
                                result.retryAttempt <= 3 ? 'bg-yellow-100 text-yellow-800' :
                                'bg-orange-100 text-orange-800'
                              }`}>
                                #{result.retryAttempt}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {result.processingConfig ? (
                              <span className="px-2 py-1 text-xs font-medium rounded bg-blue-100 text-blue-800">
                                {result.processingConfig}
                              </span>
                            ) : '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap text-sm text-slate-600">
                            {result.processingMethod || '-'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            {result.success ? (
                              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-green-100 text-green-800">
                                ✅ Exitoso
                              </span>
                            ) : (
                              <span className="px-3 py-1 text-xs font-semibold rounded-full bg-red-100 text-red-800">
                                ❌ Fallido
                              </span>
                            )}
                          </td>
                          <td className="px-6 py-4 text-sm text-red-600 max-w-xs truncate">
                            {result.error || '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                </div>
              </div>
            )}
          </div>
        )}
      </main>
      
      <ManualEntryModal
        isOpen={isManualEntryModalOpen}
        onClose={() => setIsManualEntryModalOpen(false)}
        failedResults={failedResults}
        images={images}
        onSaveManualEntry={saveManualEntry}
      />
      
      <ReviewModal
        isOpen={isReviewModalOpen}
        onClose={() => setIsReviewModalOpen(false)}
        results={results}
        images={images}
        onUpdateChecklistNumber={updateChecklistNumber}
      />
      
      <footer className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-slate-300 py-10">
        <div className="container mx-auto px-6 text-center">
          <p className="text-slate-400 text-lg">
            © 2025 Checklist Extractor Plataforma Extreme. Todos los derechos reservados.
          </p>
        </div>
      </footer>
    </div>
  );
}

export default App;