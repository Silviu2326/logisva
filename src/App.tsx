import React from 'react';
import { UploadCloud } from 'lucide-react';
import Header from './components/Header';
import UploadZone from './components/UploadZone';
import ImageGallery from './components/ImageGallery';
import ProcessingPanel from './components/ProcessingPanel';
import { useImageProcessor } from './hooks/useImageProcessor';

function App() {
  const {
    images,
    isProcessing,
    progress,
    results,
    uploadImages,
    processImages,
    clearImages,
    exportResults
  } = useImageProcessor();

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
                      Resultados Extraídos
                    </h3>
                    <p className="text-lg text-slate-600">
                      {results.length} archivos procesados exitosamente
                    </p>
                  </div>
                  <button 
                    onClick={exportResults}
                    className="btn-primary"
                  >
                    Exportar resultados
                  </button>
                </div>
                <div className="overflow-auto max-h-96 rounded-2xl border border-slate-200">
                  <table className="min-w-full divide-y divide-slate-200">
                    <thead className="bg-gradient-to-r from-slate-50 to-white">
                      <tr>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Imagen
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Items Extraídos
                        </th>
                        <th className="px-6 py-4 text-left text-sm font-semibold text-slate-600 uppercase tracking-wider">
                          Estado
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
                            {result.checklistNumber || 'No extraído'}
                          </td>
                          <td className="px-6 py-4 whitespace-nowrap">
                            <span className="px-4 py-1.5 text-sm font-semibold rounded-full bg-teal-100 text-teal-800">
                              Completado
                            </span>
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