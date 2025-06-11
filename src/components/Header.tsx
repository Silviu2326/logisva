import React from 'react';
import { ClipboardCheck } from 'lucide-react';

const Header: React.FC = () => {
  return (
    <header className="bg-gradient-to-r from-slate-900 via-slate-800 to-slate-900 text-white sticky top-0 z-10 shadow-lg animate-gradient">
      <div className="container mx-auto px-6 py-6">
        <div className="flex flex-col sm:flex-row justify-between items-center gap-6">
          <div className="flex items-center gap-4">
            <div className="p-3 bg-gradient-to-br from-teal-400 via-teal-500 to-teal-600 rounded-2xl shadow-lg shadow-teal-500/20 group hover:scale-105 transition-transform duration-300 cursor-pointer">
              <ClipboardCheck size={32} className="text-white transform group-hover:rotate-6 transition-transform duration-300" />
            </div>
            <div>
              <h1 className="text-3xl md:text-4xl font-bold bg-gradient-to-r from-white via-slate-200 to-teal-200 bg-clip-text text-transparent">
                Checklist Extractor
              </h1>
              <p className="text-slate-400 font-medium">Plataforma Extreme</p>
            </div>
          </div>
          
          <nav className="flex gap-8">
            <a 
              href="#" 
              className="text-slate-300 hover:text-white transition-all duration-300 relative group font-medium"
            >
              Inicio
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-teal-400 to-teal-500 group-hover:w-full transition-all duration-500"></span>
            </a>
            <a 
              href="#" 
              className="text-slate-300 hover:text-white transition-all duration-300 relative group font-medium"
            >
              Ayuda
              <span className="absolute -bottom-1 left-0 w-0 h-0.5 bg-gradient-to-r from-teal-400 to-teal-500 group-hover:w-full transition-all duration-500"></span>
            </a>
          </nav>
        </div>
      </div>
      
      {/* Decorative bottom border */}
      <div className="h-1 bg-gradient-to-r from-transparent via-teal-500/20 to-transparent"></div>
    </header>
  );
};

export default Header;