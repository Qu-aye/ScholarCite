import React from 'react';
import { BibliographyEntry, CitationStyle } from '../types';
import { BookMarked, Download, Copy, Trash2 } from 'lucide-react';

interface BibliographyProps {
  entries: BibliographyEntry[];
  style: CitationStyle;
  onClear: () => void;
}

// Helper to render text with markdown italics (*text*)
const renderFormattedText = (text: string) => {
  const parts = text.split(/(\*.*?\*)/g);
  return parts.map((part, index) => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return <em key={index} className="italic font-serif">{part.slice(1, -1)}</em>;
    }
    return <span key={index}>{part}</span>;
  });
};

const Bibliography: React.FC<BibliographyProps> = ({ entries, style, onClear }) => {
  const handleCopy = () => {
    // Strip markdown asterisks for plain text copy
    const text = entries.map(e => e.text.replace(/\*/g, '')).join('\n');
    navigator.clipboard.writeText(text);
    alert("Bibliography copied to clipboard!");
  };

  if (entries.length === 0) {
    return (
      <div className="bg-gray-50 border-t border-gray-200 p-12 text-center text-gray-500 mt-12">
        <BookMarked className="w-12 h-12 mx-auto mb-4 text-gray-300" />
        <h3 className="text-lg font-medium text-gray-900">Bibliography is Empty</h3>
        <p className="max-w-md mx-auto mt-2">
          Citations you generate will appear here. Select text in your document to start searching for sources.
        </p>
      </div>
    );
  }

  return (
    <div className="mt-12 bg-white rounded-lg paper-shadow overflow-hidden">
      <div className="bg-gray-50 border-b border-gray-100 p-6 flex justify-between items-center">
        <div>
          <h2 className="text-2xl font-serif font-bold text-gray-900">Bibliography</h2>
          <p className="text-sm text-gray-500 mt-1">Style: {style}</p>
        </div>
        <div className="flex gap-2">
           <button 
             onClick={handleCopy}
             className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-gray-600 bg-white border border-gray-200 rounded hover:bg-gray-50 transition-colors"
           >
             <Copy className="w-4 h-4" /> Copy
           </button>
           <button 
             onClick={onClear}
             className="flex items-center gap-2 px-3 py-1.5 text-sm font-medium text-red-600 bg-white border border-gray-200 rounded hover:bg-red-50 transition-colors"
           >
             <Trash2 className="w-4 h-4" /> Clear
           </button>
        </div>
      </div>
      
      <div className="p-8 bg-white min-h-[200px]">
        <ul className="space-y-4">
          {entries.map((entry) => (
            <li key={entry.id} className="pl-8 -indent-8 font-serif leading-relaxed text-gray-800 text-lg">
              {renderFormattedText(entry.text)}
            </li>
          ))}
        </ul>
      </div>
    </div>
  );
};

export default Bibliography;
