import React from 'react';
import { Source, SearchState } from '../types';
import { BookOpen, Link as LinkIcon, Loader2, User, Calendar, Quote, Sparkles, Layers, BookmarkPlus } from 'lucide-react';

interface CitationModalProps {
  isOpen: boolean;
  onClose: () => void;
  query: string;
  searchState: SearchState;
  onSelectSource: (source: Source) => void;
  onSaveToLibrary: (source: Source) => void;
  isFormatting: boolean;
}

const SourceCard: React.FC<{ 
  source: Source; 
  onSelect: () => void; 
  onSave: () => void;
  isFormatting: boolean 
}> = ({ source, onSelect, onSave, isFormatting }) => (
  <div 
    className="group border border-gray-200 rounded-lg p-4 hover:border-blue-400 hover:shadow-md transition-all relative bg-white"
  >
    <div className="flex justify-between items-start mb-2 cursor-pointer" onClick={!isFormatting ? onSelect : undefined}>
      <h3 className="font-semibold text-gray-900 group-hover:text-blue-700 leading-tight">
        {source.title}
      </h3>
    </div>
    
    <div className="flex flex-wrap gap-3 text-xs text-gray-500 mb-3 cursor-pointer" onClick={!isFormatting ? onSelect : undefined}>
      <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
        <User className="w-3 h-3" /> {source.author}
      </span>
      <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded">
        <Calendar className="w-3 h-3" /> {source.year}
      </span>
      <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded italic">
        <BookOpen className="w-3 h-3" /> {source.publication}
      </span>
    </div>

    <p className="text-sm text-gray-600 line-clamp-3 mb-3 cursor-pointer" onClick={!isFormatting ? onSelect : undefined}>
      {source.snippet}
    </p>

    <div className="flex justify-between items-center mt-2 pt-2 border-t border-gray-50">
       <a 
          href={source.url} 
          target="_blank" 
          rel="noreferrer" 
          className="text-xs text-blue-500 hover:underline flex items-center gap-1 z-10"
          onClick={(e) => e.stopPropagation()}
        >
          <LinkIcon className="w-3 h-3" /> View Source
        </a>
        <div className="flex items-center gap-2">
           <button
             onClick={(e) => {
                e.stopPropagation();
                onSave();
             }}
             className="text-gray-500 hover:text-blue-600 hover:bg-blue-50 p-1.5 rounded-md transition-colors"
             title="Save to Library"
           >
             <BookmarkPlus className="w-4 h-4" />
           </button>
           <button 
             onClick={onSelect}
             className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-full opacity-0 group-hover:opacity-100 transition-opacity flex items-center gap-1 shadow-lg"
             disabled={isFormatting}
           >
             {isFormatting ? <Loader2 className="w-3 h-3 animate-spin" /> : <Quote className="w-3 h-3" />}
             Cite this
           </button>
        </div>
    </div>
  </div>
);

const CitationModal: React.FC<CitationModalProps> = ({
  isOpen,
  onClose,
  query,
  searchState,
  onSelectSource,
  onSaveToLibrary,
  isFormatting,
}) => {
  if (!isOpen) return null;

  const hasResults = searchState.results.suggested.length > 0 || searchState.results.related.length > 0;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-3xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-6 border-b border-gray-100 bg-gray-50 flex justify-between items-start">
          <div>
            <h2 className="text-xl font-serif font-bold text-gray-900 flex items-center gap-2">
              <BookOpen className="w-5 h-5 text-blue-600" />
              Research Assistant
            </h2>
            <p className="text-sm text-gray-500 mt-1 line-clamp-2">
              Searching sources for: <span className="italic text-gray-700">"{query}"</span>
            </p>
          </div>
          <button 
            onClick={onClose}
            className="text-gray-400 hover:text-gray-600 transition-colors"
          >
            <span className="text-2xl font-light">&times;</span>
          </button>
        </div>

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-6 bg-gray-50 min-h-[300px]">
          {searchState.isSearching ? (
            <div className="flex flex-col items-center justify-center h-full space-y-4 text-gray-500">
              <Loader2 className="w-8 h-8 animate-spin text-blue-600" />
              <p>Searching Google Scholar, PubMed, and other databases...</p>
            </div>
          ) : searchState.error ? (
            <div className="flex flex-col items-center justify-center h-full text-red-500">
              <p>{searchState.error}</p>
            </div>
          ) : !hasResults ? (
            <div className="flex flex-col items-center justify-center h-full text-gray-500">
              <p>No sources found. Try selecting a more specific sentence.</p>
            </div>
          ) : (
            <div className="space-y-8">
              
              {/* Suggested Sources */}
              {searchState.results.suggested.length > 0 && (
                <div>
                   <div className="flex items-center gap-2 mb-3">
                     <Sparkles className="w-4 h-4 text-yellow-500" />
                     <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Suggested Sources</h3>
                   </div>
                   <div className="grid gap-4 md:grid-cols-1">
                     {searchState.results.suggested.map((source, index) => (
                       <SourceCard 
                          key={`sug-${index}`} 
                          source={source} 
                          onSelect={() => onSelectSource(source)} 
                          onSave={() => onSaveToLibrary(source)}
                          isFormatting={isFormatting} 
                        />
                     ))}
                   </div>
                </div>
              )}

              {/* Related Sources */}
              {searchState.results.related.length > 0 && (
                <div>
                   <div className="flex items-center gap-2 mb-3">
                     <Layers className="w-4 h-4 text-blue-500" />
                     <h3 className="text-sm font-bold uppercase tracking-wider text-gray-700">Other Related Sources</h3>
                   </div>
                   <div className="grid gap-4 md:grid-cols-1 opacity-90">
                     {searchState.results.related.map((source, index) => (
                       <SourceCard 
                          key={`rel-${index}`} 
                          source={source} 
                          onSelect={() => onSelectSource(source)} 
                          onSave={() => onSaveToLibrary(source)}
                          isFormatting={isFormatting} 
                        />
                     ))}
                   </div>
                </div>
              )}

            </div>
          )}
        </div>
      </div>
    </div>
  );
};

export default CitationModal;
