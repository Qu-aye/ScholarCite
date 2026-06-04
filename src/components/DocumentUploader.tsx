import React, { useState, useRef } from 'react';
import * as mammoth from 'mammoth';
import { UploadCloud, FileText, CheckCircle2, AlertCircle, RefreshCw } from 'lucide-react';

interface DocumentUploaderProps {
  onDocumentLoaded: (content: string) => void;
  currentFileName: string | null;
  setCurrentFileName: (name: string | null) => void;
  onLoadSample: () => void;
}

// Escapes raw content to safe HTML text
function escapeHtml(text: string): string {
  return text
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;');
}

// Basic inline Markdown formatting helper (bold, italic, links, inline code)
function inlineMarkdownToHtml(text: string): string {
  let html = escapeHtml(text);
  
  // Bold: **text** or __text__
  html = html.replace(/\*\*(.*?)\*\*/g, '<strong>$1</strong>');
  html = html.replace(/__(.*?)__/g, '<strong>$1</strong>');
  
  // Italic: *text* or _text_
  html = html.replace(/\*(.*?)\*/g, '<em>$1</em>');
  html = html.replace(/_(.*?)_/g, '<em>$1</em>');
  
  // Links: [text](url)
  html = html.replace(/\[(.*?)\]\((.*?)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
  
  // Inline code: `code`
  html = html.replace(/`(.*?)`/g, '<code>$1</code>');
  
  return html;
}

// Convert markdown text blocks to Tiptap-friendly HTML structure
function markdownToHtml(md: string): string {
  if (!md) return '';
  const blocks = md.split(/\n\s*\n/);
  
  return blocks.map(block => {
    const text = block.trim();
    if (!text) return '';
    
    // Check for Headings
    if (text.startsWith('# ')) {
      return `<h1>${escapeHtml(text.substring(2))}</h1>`;
    }
    if (text.startsWith('## ')) {
      return `<h2>${escapeHtml(text.substring(3))}</h2>`;
    }
    if (text.startsWith('### ')) {
      return `<h3>${escapeHtml(text.substring(4))}</h3>`;
    }
    
    const lines = text.split('\n');
    
    // Check for Unordered Lists
    if (lines.every(line => {
      const trimmed = line.trim();
      return trimmed.startsWith('- ') || trimmed.startsWith('* ') || trimmed.startsWith('+ ');
    })) {
      const items = lines.map(line => {
        const content = line.trim().substring(2);
        return `<li>${inlineMarkdownToHtml(content)}</li>`;
      }).join('');
      return `<ul>${items}</ul>`;
    }

    // Check for Ordered Lists
    if (lines.every(line => /^\d+\.\s/.test(line.trim()))) {
      const items = lines.map(line => {
        const content = line.trim().replace(/^\d+\.\s/, '');
        return `<li>${inlineMarkdownToHtml(content)}</li>`;
      }).join('');
      return `<ol>${items}</ol>`;
    }
    
    // Plain paragraphs with internal break handling
    const paragraphContent = lines.map(line => inlineMarkdownToHtml(line)).join('<br />');
    return `<p>${paragraphContent}</p>`;
  }).filter(Boolean).join('');
}

// Convert plain text into styled HTML paragraphs
function textToHtml(text: string): string {
  if (!text) return '';
  return text
    .split(/\n\s*\n/)
    .map(para => {
      const trimmed = para.trim();
      if (!trimmed) return '';
      const htmlSafe = escapeHtml(trimmed).replace(/\n/g, '<br />');
      return `<p>${htmlSafe}</p>`;
    })
    .filter(Boolean)
    .join('');
}

// Dynamic PDF text extractor helper
async function parsePdf(arrayBuffer: ArrayBuffer): Promise<string> {
  const pdfjsLib: any = await import('pdfjs-dist');
  pdfjsLib.GlobalWorkerOptions.workerSrc = `https://cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version || '3.11.174'}/pdf.worker.min.js`;

  const loadingTask = pdfjsLib.getDocument({ data: new Uint8Array(arrayBuffer) });
  const pdf = await loadingTask.promise;
  let fullText = '';
  
  for (let i = 1; i <= pdf.numPages; i++) {
    const page = await pdf.getPage(i);
    const textContent = await page.getTextContent();
    let lastY = -1;
    let pageText = '';
    
    for (const item of textContent.items as any[]) {
      // Assemble standard lines of text by matching y-coordinates
      if (lastY !== -1 && Math.abs(item.transform[5] - lastY) > 5) {
        pageText += '\n';
      }
      pageText += item.str;
      lastY = item.transform[5];
    }
    fullText += pageText + '\n\n';
  }
  
  return fullText;
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
    const filenameLower = file.name.toLowerCase();

    // MS Word: .docx
    if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || filenameLower.endsWith('.docx')) {
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
    } 
    // Plain Text: .txt
    else if (file.type === 'text/plain' || filenameLower.endsWith('.txt')) {
      setIsLoading(true);
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const textContent = e.target?.result as string;
            if (textContent && textContent.trim().length > 0) {
              const htmlContent = textToHtml(textContent);
              onDocumentLoaded(htmlContent);
              setCurrentFileName(file.name);
            } else {
              setError("The uploaded text document appears to be empty.");
            }
          } catch (err) {
            setError("Failed to read text file content.");
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsText(file);
      } catch (err) {
        setError("Error opening the selected file.");
        setIsLoading(false);
      }
    }
    // Markdown: .md
    else if (filenameLower.endsWith('.md')) {
      setIsLoading(true);
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const textContent = e.target?.result as string;
            if (textContent && textContent.trim().length > 0) {
              const htmlContent = markdownToHtml(textContent);
              onDocumentLoaded(htmlContent);
              setCurrentFileName(file.name);
            } else {
              setError("The uploaded Markdown document appears to be empty.");
            }
          } catch (err) {
            setError("Failed to parse Markdown file content.");
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsText(file);
      } catch (err) {
        setError("Error opening the selected file.");
        setIsLoading(false);
      }
    }
    // PDF Document: .pdf
    else if (file.type === 'application/pdf' || filenameLower.endsWith('.pdf')) {
      setIsLoading(true);
      try {
        const reader = new FileReader();
        reader.onload = async (e) => {
          try {
            const arrayBuffer = e.target?.result as ArrayBuffer;
            const pdfText = await parsePdf(arrayBuffer);
            if (pdfText && pdfText.trim().length > 0) {
              const htmlContent = textToHtml(pdfText);
              onDocumentLoaded(htmlContent);
              setCurrentFileName(file.name);
            } else {
              setError("The uploaded PDF document does not contain extractable plain text.");
            }
          } catch (err) {
            setError("Failed to parse and extract text from the PDF. Ensure it is not scanned/image-only.");
          } finally {
            setIsLoading(false);
          }
        };
        reader.readAsArrayBuffer(file);
      } catch (err) {
        setError("Error opening the selected file.");
        setIsLoading(false);
      }
    }
    else {
      setError('Unsupported format. Please upload a Microsoft Word document (.docx), Plain Text (.txt), Markdown (.md), or PDF (.pdf).');
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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 flex flex-col space-y-5 transition-all duration-300 hover:shadow-md" id="document-uploader-section">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg font-serif font-bold text-slate-900">Draft Ingestion</h2>
          <p className="text-xs text-slate-500 font-sans mt-0.5">Load an academic draft (Word, Plain Text, Markdown, PDF) or start with templates</p>
        </div>
        {!currentFileName && (
          <button
            onClick={onLoadSample}
            className="group text-xs font-sans font-semibold text-indigo-600 hover:text-indigo-700 bg-indigo-50/50 hover:bg-indigo-50 border border-indigo-100 rounded-xl px-3.5 py-2 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] flex items-center justify-center gap-1.5 cursor-pointer"
          >
            <RefreshCw className="w-3.5 h-3.5 group-hover:rotate-180 transition-transform duration-500 text-indigo-500" />
            Load Academic Template
          </button>
        )}
      </div>

      <div
        className={`relative border-2 border-dotted rounded-xl p-8 transition-all duration-300 flex flex-col items-center justify-center text-center cursor-pointer ${
          isDragActive
            ? 'border-indigo-500 bg-indigo-50/40'
            : currentFileName
            ? 'border-emerald-500/80 bg-emerald-50/10'
            : 'border-slate-300 hover:border-indigo-500 hover:bg-slate-50/50'
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
          accept=".docx,.txt,.md,.pdf"
          onChange={handleFileInputChange}
          id="docx-file-input"
        />

        {isLoading ? (
          <div className="flex flex-col items-center space-y-3 py-5">
            <RefreshCw className="w-8 h-8 text-indigo-600 animate-spin" />
            <p className="text-sm font-sans font-semibold text-slate-700">Converting workspace draft to editable prose...</p>
          </div>
        ) : currentFileName ? (
          <div className="flex flex-col items-center space-y-3 py-2">
            <div className="w-12 h-12 bg-emerald-50 rounded-full flex items-center justify-center border border-emerald-100 shadow-sm">
              <CheckCircle2 className="w-6 h-6 text-emerald-600" />
            </div>
            <div className="space-y-1">
              <p className="text-sm font-sans font-bold text-slate-800">Loaded Successfully</p>
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
              className="mt-2 text-xs font-sans font-semibold text-rose-600 hover:text-rose-700 px-3.5 py-1.5 bg-rose-50 hover:bg-rose-100 rounded-xl border border-rose-200/50 transition-all duration-200 cursor-pointer"
            >
              Unload File
            </button>
          </div>
        ) : (
          <div className="flex flex-col items-center space-y-3 py-5 group">
            <UploadCloud className="w-10 h-10 text-slate-400 group-hover:text-indigo-600 group-hover:scale-105 transition-all duration-300" />
            <div className="text-sm text-slate-600 font-sans">
              <span className="font-semibold text-indigo-600 hover:underline">Click to browse</span> or drag & drop your document draft here
            </div>
            <span className="text-xxs text-slate-400 font-sans tracking-wide uppercase">Supported formats: .docx, .txt, .md, .pdf</span>
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
