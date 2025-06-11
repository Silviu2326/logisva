import React, { useState, useRef } from 'react';
import { UploadCloud, FolderOpen } from 'lucide-react';

interface UploadZoneProps {
  onUpload: (files: File[]) => void;
}

const UploadZone: React.FC<UploadZoneProps> = ({ onUpload }) => {
  const [isDragging, setIsDragging] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const handleDragOver = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(true);
  };

  const handleDragLeave = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
  };

  const handleDrop = (e: React.DragEvent<HTMLDivElement>) => {
    e.preventDefault();
    setIsDragging(false);
    
    const items = e.dataTransfer.items;
    const filesList: File[] = [];
    
    if (items) {
      const traverseFileTree = async (item: any, path = '') => {
        if (item.isFile) {
          const file = await new Promise<File>((resolve) => {
            item.file((file: File) => {
              resolve(file);
            });
          });
          filesList.push(file);
        } else if (item.isDirectory) {
          const dirReader = item.createReader();
          const entries = await new Promise<any[]>((resolve) => {
            dirReader.readEntries((entries: any[]) => {
              resolve(entries);
            });
          });
          
          for (const entry of entries) {
            await traverseFileTree(entry, path + item.name + '/');
          }
        }
      };
      
      const processItems = async () => {
        for (let i = 0; i < items.length; i++) {
          const item = items[i].webkitGetAsEntry();
          if (item) {
            await traverseFileTree(item);
          }
        }
        
        const imageFiles = filesList.filter(file => 
          file.type.startsWith('image/')
        );
        
        if (imageFiles.length > 0) {
          onUpload(imageFiles);
        } else {
          alert('No se encontraron imágenes en la carpeta seleccionada');
        }
      };
      
      processItems();
    }
  };

  const handleFileInputChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files.length > 0) {
      const files = Array.from(e.target.files).filter(file => 
        file.type.startsWith('image/')
      );
      
      if (files.length > 0) {
        onUpload(files);
      } else {
        alert('No se encontraron imágenes en los archivos seleccionados');
      }
    }
  };

  const handleClick = () => {
    fileInputRef.current?.click();
  };

  return (
    <div
      className={`relative overflow-hidden card border-3 border-dashed rounded-3xl p-16 flex flex-col items-center justify-center cursor-pointer transition-all duration-500 w-full max-w-2xl mx-auto group
        ${isDragging 
          ? 'border-teal-500 bg-teal-50/50 scale-102 shadow-2xl shadow-teal-500/20' 
          : 'border-slate-200 hover:border-slate-300 hover:scale-[1.01] hover:shadow-2xl'}`}
      onDragOver={handleDragOver}
      onDragLeave={handleDragLeave}
      onDrop={handleDrop}
      onClick={handleClick}
    >
      <input
        type="file"
        ref={fileInputRef}
        onChange={handleFileInputChange}
        className="hidden"
        multiple
        accept="image/*"
        webkitdirectory=""
        directory=""
      />
      
      <div className={`h-32 w-32 rounded-3xl flex items-center justify-center mb-8 transition-all duration-500 relative
        ${isDragging 
          ? 'bg-teal-100 text-teal-600 rotate-6 scale-110' 
          : 'bg-gradient-to-br from-slate-100 to-slate-50 text-slate-400 group-hover:scale-105 group-hover:rotate-3'}`}>
        <div className="absolute inset-0 bg-gradient-mesh rounded-3xl opacity-50"></div>
        <UploadCloud size={48} className="animate-float relative z-10" />
      </div>
      
      <div className="text-center relative z-10">
        <h2 className="text-3xl font-bold mb-3 bg-gradient-to-r from-slate-800 via-slate-700 to-slate-800 bg-clip-text text-transparent">
          {isDragging ? 'Suelta para cargar imágenes' : 'Arrastra y suelta una carpeta'}
        </h2>
        <p className="text-slate-500 text-lg mb-8">o haz clic para seleccionar archivos</p>
        
        <button 
          type="button"
          className="btn-primary inline-flex items-center gap-3 text-lg group/btn"
        >
          <FolderOpen size={22} className="transition-transform group-hover/btn:rotate-6" />
          Seleccionar carpeta
        </button>
      </div>
      
      {/* Background decorative elements */}
      <div className="absolute inset-0 bg-gradient-mesh opacity-10"></div>
      <div className={`absolute inset-0 bg-gradient-radial from-teal-500/5 to-transparent transition-opacity duration-500
        ${isDragging ? 'opacity-100' : 'opacity-0'}`}></div>
    </div>
  );
};

export default UploadZone;