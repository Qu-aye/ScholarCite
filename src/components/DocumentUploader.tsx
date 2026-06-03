import React, { useState, useRef } from 'react';
import * as mammoth from 'mammoth';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface DocumentUploaderProps {
  onDocumentLoaded: (content: string) => void;
  currentFileName: string | null;
  setCurrentFileName: (name: string | null) => void;
  onLoadSample: () => void;
}

export default function DocumentUploader({
  onDocumentLoaded,
  currentFileName,
  setCurrentFileName,
  onLoadSample,
}: DocumentUploaderProps) {
  const [isDragActive, setIsDragActive] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const fileInputRef = useRef<HTMLInputElement>(null);

  const processFile = async (file: File) => {
    if (!file) return;
    setError(null);

    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
      setIsLoading(true);
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const result = await mammoth.convertToHtml({ arrayBuffer });
            
            if (result.value && result.value.trim().length > 0) {
              onDocumentLoaded(result.value);
              setCurrentFileName(file.name);
            } else {
              setError("The uploaded Word document appears to be empty.");
            }
          } catch (err) {
            setError("Failed to convert Word document structure. Ensure it is a valid .docx file.");
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        setError("Error opening the selected file.");
        setIsLoading(false);
      }
    } else {
      setError('Unsupported format. Please upload a Microsoft Word document (.docx).');
    }
  };

  const handleDrag = (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    if (e.type === 'dragenter' || e.type === 'dragover') {
      setIsDragActive(true);
    } else if (e.type === 'dragleave') {
      setIsDragActive(false);
    }
  };

  const handleDrop = async (e: React.DragEvent) => {
    e.preventDefault();
    e.stopPropagation();
    setIsDragActive(false);

    if (e.dataTransfer.files && e.dataTransfer.files[0]) {
      await processFile(e.dataTransfer.files[0]);
    }
  };

  const handleFileInputChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    if (e.target.files && e.target.files[0]) {
      await processFile(e.target.files[0]);
    }
  };

  const onButtonClick = () => {
    fileInputRef.current?.click();
  };

  const handleClear = () => {
    setCurrentFileName(null);
    onDocumentLoaded('');
    setError(null);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col space-y-4" id="document-uploader-section">
      <div className="flex items-center justify-between">
        <div>
          <h2 className="text-xl font-serif font-bold text-slate-800">Draft Alignment</h2>
          <p className="text-xs text-slate-500 font-sans mt-0.5">Prefill the workspace with an existing Word draft or template</p>
        </div>
        {!currentFileName && (
          <button
            onClick={onLoadSample}
            className="text-xs font-sans font-medium text-slate-500 hover:text-slate-800 bg-slate-50 hover:bg-slate-100 border border-slate-300 rounded-md px-3 py-1.5 transition-colors duration-200 flex items-center gap-1.5"
          >
            <RefreshCw className="w-3.5 h-3.5" />
            Load Academic Template
          </button>
        )}
      </div>

      <div
        className={`relative border-2 border-dashed rounded-lg p-8 transition-all flex flex-col items-center justify-center text-center cursor-pointer ${
          isDragActive
            ? 'border-teal-500 bg-teal-50/20'
            : currentFileName
            ? 'border-teal-600 bg-teal-50/10'
            : 'border-slate-300 hover:border-blue-900 hover:bg-slate-50/50'
        }`}
        onDragEnter={handleDrag}
        onDragOver={handleDrag}
        onDragLeave={handleDrag}
        onDrop={handleDrop}
        onClick={currentFileName ? undefined : onButtonClick}
      >
        <input
          ref={fileInputRef}
          type="file"
          className="hidden"
          accept=".docx"
          onChange={handleFileInputChange}
          id="docx-file-input"
        />

        {isLoading ? (
          <div className="flex flex-col items-center space-y-2 py-4">
            <RefreshCw className="w-8 h-8 text-blue-900 animate-spin" />
            <p className="text-sm font-sans font-medium text-slate-700">Converting Word structure to editable prose...</p>
          </div>
        ) : currentFileName ? (
          <div className="flex flex-col items-center space-y-3 py-2">
            <div className="w-12 h-12 bg-teal-50 rounded-full flex items-center justify-center border border-teal-100">
              <CheckCircle2 className="w-6 h-6 text-teal-600" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-sans font-semibold text-slate-800">Loaded Successfully</p>
              <div className="flex items-center justify-center gap-1.5 text-xs text-slate-500 font-mono">
                <FileText className="w-3.5 h-3.5 text-slate-400" />
                <span>{currentFileName}</span>
              </div>
            </div>
            <button
              onClick={(e) => {
                e.stopPropagation();
                handleClear();
              }}
              className="mt-2 text-xs font-sans font-medium text-red-600 hover:text-red-700 hover:underline px-3 py-1 bg-red-50 hover:bg-red-100 rounded-md border border-red-200 transition-colors cursor-pointer"
            >
              Unload File
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-2 py-4">
            <UploadCloud className="w-10 h-10 text-slate-400 group-hover:text-blue-900 transition-colors" />
            <div className="text-sm text-slate-600 font-sans">
              <span className="font-semibold text-blue-900 hover:underline">Click to browse</span> or drag and drop your Microsoft Word file here
            </div>
            <span className="text-xxs text-slate-400 font-sans">Supported format: .docx documents only</span>
          </div>
        )}
      </div>

      {error && (
        <div className="flex items-center gap-2 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-sans">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500" />
          <span>{error}</span>
        </div>
      )}
    </div>
  );
}
