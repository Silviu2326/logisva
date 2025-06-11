import React from 'react';
import { Loader2 } from 'lucide-react';

interface ProcessingPanelProps {
  progress: number;
}

const ProcessingPanel: React.FC<ProcessingPanelProps> = ({ progress }) => {
  return (
    <div className="card p-12 flex flex-col items-center transform transition-all duration-500">
      <div className="mb-12 relative">
        <div className="relative h-48 w-48">
          {/* Background circle */}
          <div className="absolute inset-0 rounded-full bg-gradient-to-br from-slate-100 to-slate-50"></div>
          
          {/* Progress ring */}
          <svg className="absolute inset-0 transform -rotate-90" viewBox="0 0 100 100">
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="currentColor"
              strokeWidth="6"
              fill="none"
              className="text-slate-200"
              strokeLinecap="round"
            />
            <circle
              cx="50"
              cy="50"
              r="45"
              stroke="url(#gradient)"
              strokeWidth="6"
              fill="none"
              className="transition-all duration-500"
              strokeDasharray={`${progress * 2.827}, 1000`}
              strokeLinecap="round"
            />
            <defs>
              <linearGradient id="gradient" x1="0%" y1="0%" x2="100%" y2="0%">
                <stop offset="0%" stopColor="#14b8a6" />
                <stop offset="100%" stopColor="#0d9488" />
              </linearGradient>
            </defs>
          </svg>
          
          {/* Inner content */}
          <div className="absolute inset-0 flex items-center justify-center">
            <div className="text-center">
              <span className="text-4xl font-bold bg-gradient-to-br from-slate-800 to-slate-600 bg-clip-text text-transparent">
                {Math.round(progress)}%
              </span>
              <div className="text-sm font-medium text-slate-500 mt-1">Completado</div>
            </div>
          </div>
        </div>
      </div>
      
      <h3 className="text-3xl font-bold bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-clip-text text-transparent mb-4">
        Procesando imágenes
      </h3>
      <p className="text-slate-600 text-lg mb-12 text-center max-w-lg">
        Extrayendo información de checklists. Este proceso puede tomar varios minutos dependiendo del número de imágenes.
      </p>
      
      <div className="w-full max-w-2xl mb-8">
        <div className="h-3 bg-slate-100 rounded-full overflow-hidden shadow-inner-lg">
          <div 
            className="h-full bg-gradient-to-r from-teal-400 to-teal-600 rounded-full transition-all duration-500 ease-out animate-pulse-slow"
            style={{ width: `${progress}%` }}
          ></div>
        </div>
      </div>
      
      <div className="flex items-center justify-center gap-3 text-base font-medium text-slate-500 bg-slate-50 px-6 py-3 rounded-full shadow-inner-lg">
        <Loader2 size={20} className="animate-spin text-teal-500" />
        <span>Por favor, no cierre esta ventana</span>
      </div>
    </div>
  );
};

export default ProcessingPanel;