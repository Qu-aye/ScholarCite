import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { searchSources, Source } from '../services/searchService';
import { Sparkles, BookOpen, Search, Check, AlertCircle, FileText, Loader2, BookMarked, X, Settings2 } from 'lucide-react';

export interface DocumentEditorProps {
  content: string;
  onContentChange?: (html: string) => void;
  bibliography?: Source[];
  onBibliographyChange?: (sources: Source[]) => void;
  citationStyle?: 'harvard' | 'apa' | 'mla' | 'chicago';
  onCitationStyleChange?: (style: 'harvard' | 'apa' | 'mla' | 'chicago') => void;
}

export default function DocumentEditor({
  content,
  onContentChange,
  bibliography: externalBibliography,
  onBibliographyChange,
  citationStyle: externalCitationStyle,
  onCitationStyleChange,
}: DocumentEditorProps) {
  const [selectedText, setSelectedText] = useState('');
  const [showPopup, setShowPopup] = useState(false);
  const [searchResults, setSearchResults] = useState<Source[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [menuCoords, setMenuCoords] = useState<{ x: number; y: number } | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);

  // Fallback local states if not synced externally
  const [localBibliography, setLocalBibliography] = useState<Source[]>([]);
  const [localCitationStyle, setLocalCitationStyle] = useState<'harvard' | 'apa' | 'mla' | 'chicago'>('harvard');

  const bibliography = externalBibliography !== undefined ? externalBibliography : localBibliography;
  const setBibliography = (valOrUpdater: Source[] | ((prev: Source[]) => Source[])) => {
    if (onBibliographyChange) {
      if (typeof valOrUpdater === 'function') {
        onBibliographyChange(valOrUpdater(bibliography));
      } else {
        onBibliographyChange(valOrUpdater);
      }
    } else {
      setLocalBibliography(valOrUpdater);
    }
  };

  const citationStyle = externalCitationStyle !== undefined ? externalCitationStyle : localCitationStyle;
  const setCitationStyle = (style: 'harvard' | 'apa' | 'mla' | 'chicago') => {
    if (onCitationStyleChange) {
      onCitationStyleChange(style);
    } else {
      setLocalCitationStyle(style);
    }
  };
  
  const editorContainerRef = useRef<HTMLDivElement>(null);

  const editor = useEditor({
    extensions: [StarterKit],
    content: content,
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from === to) {
        setMenuCoords(null);
        return;
      }

      try {
        const { view } = editor;
        const start = view.coordsAtPos(from);
        const end = view.coordsAtPos(to);
        const container = editorContainerRef.current;
        
        if (!container) return;
        
        const containerBounds = container.getBoundingClientRect();
        
        // Center the menu relative to the selection bounds inside the container
        const left = (start.left + end.left) / 2 - containerBounds.left;
        const top = start.top - containerBounds.top - 48; // Position nicely above selection
        
        // Ensure menu is inside reasonable horizontal bounds
        if (left > -50 && left < containerBounds.width + 50 && top > -100) {
          setMenuCoords({ x: left, y: top });
        } else {
          setMenuCoords(null);
        }
      } catch (e) {
        setMenuCoords(null);
      }
    },
    onUpdate: ({ editor }) => {
      setMenuCoords(null);
      if (onContentChange) {
        onContentChange(editor.getHTML());
      }
    }
  });

  // Keep editor content in sync when a new document/template is loaded
  useEffect(() => {
    if (editor && typeof content === 'string') {
      // Only set content if it differs from the current editor output to avoid cursor jumps
      if (editor.getHTML() !== content && (content !== '' || editor.getHTML() !== '<p></p>')) {
        editor.commands.setContent(content);
      }
    }
  }, [content, editor]);

  // Close popup or floating menu on clicking outside editor area
  useEffect(() => {
    const handleOutsideClick = (e: MouseEvent) => {
      if (editorContainerRef.current && !editorContainerRef.current.contains(e.target as Node)) {
        setMenuCoords(null);
      }
    };
    document.addEventListener('mousedown', handleOutsideClick);
    return () => document.removeEventListener('mousedown', handleOutsideClick);
  }, []);

  // Listen for Escape key to close the popup modal
  useEffect(() => {
    const handleKeyDown = (e: KeyboardEvent) => {
      if (e.key === 'Escape' && showPopup) {
        closePopup();
      }
    };
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, [showPopup]);

  const handleSearch = async () => {
    if (!editor) return;
    const { from, to } = editor.state.selection;
    const text = editor.state.doc.textBetween(from, to, ' ');
    
    if (text && text.trim().length > 0) {
      setSelectedText(text);
      setInsertPosition(to); // Save insertion point offset
      setShowPopup(true);
      setIsLoading(true);
      setMenuCoords(null); // Hide active selection popup
      
      try {
        const results = await searchSources(text);
        setSearchResults(results);
      } catch (err) {
        console.error(err);
      } finally {
        setIsLoading(false);
      }
    }
  };

  const closePopup = () => {
    setShowPopup(false);
    setInsertPosition(null);
  };

  const insertCitation = (source: Source) => {
    if (!editor) return;

    // Check if source is already in bibliography to maintain uniques
    setBibliography((prev) => {
      if (prev.some((item) => item.doi === source.doi)) {
        return prev;
      }
      return [...prev, source];
    });

    // Format in-text citation based on style metadata
    const citationData = source.citations?.[citationStyle];
    const inTextMarker = citationData?.inText || `[${source.author}, ${source.year}]`;

    // Insert citation at saved exact insertion index
    const position = insertPosition !== null ? insertPosition : editor.state.selection.to;
    editor.commands.focus();
    editor.commands.setTextSelection(position);
    editor.commands.insertContent(` ${inTextMarker}`);
    
    // Immediately close modal pop-up so it leaves the screen
    setShowPopup(false);
    setInsertPosition(null);
  };

  return (
    <div className="space-y-6">
      {/* Configuration Row / Academic Styling Selector */}
      <div className="flex flex-col sm:flex-row items-between sm:items-center justify-between gap-4 p-5 bg-slate-50 border border-slate-200/80 rounded-2xl">
        <div className="flex items-center gap-3">
          <BookMarked className="w-5 h-5 text-indigo-600" />
          <div className="space-y-0.5">
            <h3 className="text-sm font-sans font-bold text-slate-800">Referencing Profile</h3>
            <p className="text-xs text-slate-500 font-sans">Choose formatting guidelines for compiled footnotes and citations</p>
          </div>
        </div>
        
        <div className="flex items-center gap-2">
          <span className="text-xxs font-bold text-slate-400 font-sans uppercase tracking-wider">Profile:</span>
          <select 
            value={citationStyle}
            onChange={(e) => setCitationStyle(e.target.value as any)}
            className="text-xs font-sans font-semibold bg-white hover:bg-slate-55 border border-slate-200 text-slate-800 rounded-xl px-3.5 py-2 focus:outline-none focus:ring-2 focus:ring-teal-500 focus:border-teal-500 transition-all cursor-pointer"
          >
            <option value="harvard">Cite Them Right Harvard</option>
            <option value="apa">APA 7th Edition</option>
            <option value="mla">MLA 9th Edition</option>
            <option value="chicago">Chicago Manual of Style</option>
          </select>
        </div>
      </div>

      {/* Editor component container - generous and full size */}
      <div className="relative" ref={editorContainerRef} id="editor-wrapper">
        <div className="border border-transparent rounded-2xl overflow-hidden bg-white shadow-sm hover:shadow-md transition-all duration-300 focus-within:ring-2 focus-within:ring-teal-500/85 focus-within:ring-offset-2">
          <div className="border-b border-slate-100 px-5 py-4 bg-slate-50/40 flex items-center justify-between">
            <div className="flex items-center gap-2.5">
              <FileText className="w-4 h-4 text-indigo-500" />
              <span className="text-xxs font-bold text-slate-400 font-sans uppercase tracking-wider">Draft Editor Canvas</span>
            </div>
            <span className="text-xxs font-mono text-indigo-650 bg-indigo-50 px-2.5 py-0.5 rounded-full font-semibold">Prose Editor</span>
          </div>
          
          <div className="p-6 sm:p-8 min-h-[350px]">
            <EditorContent 
              editor={editor} 
              className="prose prose-slate max-w-none focus:outline-none min-h-[300px] text-slate-850 font-sans leading-relaxed" 
            />
          </div>

          {/* Inline workflow guide banner inside the workspace */}
          <div className="border-t border-slate-100 px-5 py-4 bg-slate-50/40 flex items-center justify-between text-xs text-slate-505 font-sans">
            <span className="flex items-center gap-2">
              <Sparkles className="w-4 h-4 text-indigo-600 shrink-0" />
              <span>
                Highlight any claim or phrase segment in the editor to trigger the live <strong className="text-indigo-600 font-bold">Find Citation</strong> assistant.
              </span>
            </span>
          </div>
        </div>

        {/* Elegant Floating Selection Bubble Menu */}
        {menuCoords && (
          <div 
            style={{ left: `${menuCoords.x}px`, top: `${menuCoords.y}px` }}
            className="absolute z-40 transform -translate-x-1/2 transition-all duration-150 ease-out"
          >
            <button
              onClick={handleSearch}
              className="flex items-center gap-1.5 bg-indigo-600 border border-indigo-700 text-white shadow-lg hover:bg-indigo-700 focus:outline-none hover:scale-105 active:scale-95 transition-all px-4 py-2.5 rounded-full text-xs font-semibold font-sans uppercase tracking-wider cursor-pointer"
            >
              <Sparkles className="w-3.5 h-3.5 text-teal-350 animate-pulse" />
              Find Citation
            </button>
          </div>
        )}
      </div>

      {/* Styled Bibliography card section */}
      <div className="bg-white border border-slate-200/80 rounded-2xl p-6 shadow-sm hover:shadow-md transition-all duration-300" id="bibliography-pane">
        <div className="border-b border-slate-150 pb-4 mb-4 flex items-center gap-3">
          <BookOpen className="w-5 h-5 text-indigo-650" />
          <div>
            <h2 className="text-lg font-serif font-bold text-slate-900">Bibliography</h2>
            <p className="text-xs text-slate-500 font-sans">References automatically indexed and formatted as bracket citations are inserted</p>
          </div>
        </div>
        
        <div>
          {bibliography.length === 0 ? (
            <div className="py-12 text-center bg-slate-55/40 border border-dashed border-slate-200 rounded-xl space-y-2">
              <BookOpen className="w-8 h-8 text-slate-350 mx-auto" />
              <p className="text-xs font-semibold text-slate-500 font-sans">References will compile automatically</p>
              <p className="text-xxs text-slate-400 font-sans max-w-[280px] mx-auto leading-relaxed">
                Highlight a claim segment in your paper draft above and anchor your first literature citation
              </p>
            </div>
          ) : (
            <div className="space-y-4">
              {bibliography.map((source, index) => {
                const citationData = source.citations?.[citationStyle];
                const fullReference = citationData?.full || `${source.author} (${source.year}). *${source.title}*. DOI: ${source.doi}`;
                return (
                  <div key={source.doi || index} className="bg-stone-50/50 border-l-4 border-indigo-600 p-5 rounded-r-xl font-serif font-medium text-sm text-slate-800 leading-relaxed break-words shadow-xxs">
                    <span className="font-sans font-bold text-xxs text-indigo-600 mr-2 bg-indigo-50 px-2 py-1 rounded-md inline-block align-middle transform -translate-y-0.5">
                      [{index + 1}]
                    </span>
                    <span className="align-middle">{fullReference}</span>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>

      {/* Animated Backdrop Modal Overlay Popup for Academic Literature search */}
      {showPopup && (
        <div 
          className="fixed inset-0 bg-slate-900/40 backdrop-blur-xs z-50 flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={closePopup}
        >
          <div 
            className="bg-white border border-slate-200 rounded-2xl shadow-2xl w-full max-w-xl max-h-[85vh] overflow-hidden flex flex-col space-y-4 animate-in fade-in zoom-in-95 duration-200 p-6"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Modal Header */}
            <div className="flex items-center justify-between pb-3 border-b border-slate-100">
              <div className="flex items-center gap-2.5">
                <Search className="w-5 h-5 text-indigo-600 animate-pulse" />
                <h4 className="text-base font-serif font-bold text-slate-900">Academic Literature Search</h4>
              </div>
              <button 
                onClick={closePopup}
                className="text-slate-400 hover:text-slate-600 hover:bg-slate-100 p-1.5 rounded-lg transition-colors cursor-pointer"
                aria-label="Close dialog"
              >
                <X className="w-4.5 h-4.5" />
              </button>
            </div>

            {/* Inquiring context - styled elegantly as a Citation Output Box to represent search */}
            <div className="space-y-1.5">
              <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider font-sans">Inquiring Context:</span>
              <div className="bg-stone-50/50 border-l-4 border-indigo-600 p-4 rounded-r-xl font-sans text-xs text-slate-700 italic leading-relaxed">
                "{selectedText.length > 200 ? `${selectedText.substring(0, 200)}...` : selectedText}"
              </div>
            </div>

            {/* Results Body column */}
            <div className="flex-1 overflow-y-auto min-h-[220px] pr-1">
              {isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <span className="text-xs text-slate-500 font-semibold font-sans tracking-wide">Querying catalogues & registries...</span>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center space-y-2">
                  <AlertCircle className="w-6 h-6 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-700 font-sans">No matching literature indexes identified</p>
                  <p className="text-xxs text-slate-400 font-sans max-w-[320px] mx-auto leading-relaxed">
                    Try highlight-selecting a simpler key phrase or active claim segment
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider font-sans">Found Citations:</span>
                    <span className="text-xxs font-bold font-sans bg-indigo-50 text-indigo-750 px-2.5 py-0.5 rounded-full border border-indigo-100">
                      {searchResults.length} Matches Found
                    </span>
                  </div>
                  
                  <div className="space-y-3">
                    {searchResults.map((source, index) => {
                      const citationData = source.citations?.[citationStyle];
                      const inTextMarker = citationData?.inText || `[${source.author}, ${source.year}]`;
                      return (
                        <div 
                          key={source.doi || index} 
                          onClick={() => insertCitation(source)}
                          className="group relative bg-white border border-slate-200 hover:border-indigo-600 hover:bg-slate-50/40 p-4 rounded-xl shadow-xxs transition-all flex flex-col gap-2.5 cursor-pointer"
                        >
                          <h5 className="text-xs font-bold text-slate-800 leading-snug group-hover:text-indigo-600 transition-colors">
                            {source.title}
                          </h5>
                          
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xxs text-slate-505 font-sans">
                            <span className="font-bold text-slate-600">{source.author}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span>{source.year}</span>
                            {source.doi && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="font-mono text-slate-400">{source.doi}</span>
                              </>
                            )}
                          </div>

                          {/* Quick preview styled like citation output box but smaller */}
                          <div className="flex items-center justify-between p-2.5 bg-slate-50 rounded-xl border border-slate-100 text-xxs group-hover:bg-white transition-colors">
                            <span className="text-slate-500 font-serif">In-text formatting:</span>
                            <span className="font-mono font-bold text-indigo-600 bg-indigo-50/50 px-2.5 py-0.5 rounded-md border border-indigo-100/40">
                              {inTextMarker}
                            </span>
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// Inline Helper Icon
function PlusIcon(props: React.SVGProps<SVGSVGElement>) {
  return (
    <svg 
      fill="none" 
      stroke="currentColor" 
      strokeWidth="2.5" 
      viewBox="0 0 24 24" 
      className={props.className} 
      {...props}
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M12 4.5v15m7.5-7.5h-15" />
    </svg>
  );
}
