import React, { useState, useRef, useEffect } from 'react';
import { Sparkles, Settings2, Upload, Download, FileText, File, Presentation, BookMarked, Undo, Redo } from 'lucide-react';
import CitationModal from './components/CitationModal';
import CitationManager from './components/CitationManager';
import Bibliography from './components/Bibliography';
import { CitationStyle, SearchState, Source, BibliographyEntry, CitationResult } from './types';
import { CITATION_STYLES, INITIAL_DOCUMENT_TEXT } from './constants';
import { searchForSources, formatCitation } from './services/geminiService';
import { parseDocument, exportToWord, exportToPdf, exportToPptx } from './services/documentService';

// Regex to identify standard parenthetical citations: (Name, Year) or (Name et al., Year)
// Matches: (Smith, 2023), (Smith et al., 2023), (Smith & Doe, 2023)
const CITATION_REGEX = /\((?:[A-Z][a-zA-Z\s.&-]+(?: et al\.)?, \d{4})\)/g;

function App() {
  // Document State
  const [docText, setDocText] = useState(INITIAL_DOCUMENT_TEXT);
  const [bibEntries, setBibEntries] = useState<BibliographyEntry[]>([]);
  const [citationStyle, setCitationStyle] = useState<CitationStyle>(CitationStyle.HARVARD);
  const [library, setLibrary] = useState<Source[]>([]);
  
  // History State
  const [historyState, setHistoryState] = useState<{
    history: { text: string; bib: BibliographyEntry[] }[];
    index: number;
  }>({
    history: [{ text: INITIAL_DOCUMENT_TEXT, bib: [] }],
    index: 0
  });
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  // Selection State
  const [selection, setSelection] = useState<{ start: number; end: number; text: string } | null>(null);
  const [showTooltip, setShowTooltip] = useState(false);
  const [tooltipPos, setTooltipPos] = useState<{ x: number, y: number }>({ x: 0, y: 0 });
  const tooltipRef = useRef<HTMLDivElement>(null);
  const textAreaRef = useRef<HTMLTextAreaElement>(null);
  const backdropRef = useRef<HTMLDivElement>(null);
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Search/Modal State
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [isLibraryOpen, setIsLibraryOpen] = useState(false);
  const [searchState, setSearchState] = useState<SearchState>({
    isSearching: false,
    results: { suggested: [], related: [] },
    error: null,
  });
  const [isFormatting, setIsFormatting] = useState(false);
  const [isProcessingFile, setIsProcessingFile] = useState(false);
  const [showExportMenu, setShowExportMenu] = useState(false);

  // --- Sync Scroll ---
  const handleScroll = () => {
    if (textAreaRef.current && backdropRef.current) {
      backdropRef.current.scrollTop = textAreaRef.current.scrollTop;
    }
  };

  // --- Render Highlights ---
  const renderHighlights = (text: string) => {
    const parts = text.split(CITATION_REGEX);
    const matches = text.match(CITATION_REGEX) || [];
    
    return parts.reduce((acc: React.ReactNode[], part, i) => {
      acc.push(<span key={`text-${i}`}>{part}</span>);
      if (matches[i]) {
        acc.push(
          <span key={`match-${i}`} className="bg-blue-100 rounded-sm border-b-2 border-blue-200">
            {matches[i]}
          </span>
        );
      }
      return acc;
    }, []);
  };

  // --- History Helpers ---

  const saveToHistory = (text: string, bib: BibliographyEntry[]) => {
    setHistoryState(prev => {
      const current = prev.history[prev.index];
      // Avoid duplicate states
      if (current.text === text && JSON.stringify(current.bib) === JSON.stringify(bib)) {
        return prev;
      }
      
      const newHistory = prev.history.slice(0, prev.index + 1);
      newHistory.push({ text, bib });
      return {
        history: newHistory,
        index: newHistory.length - 1
      };
    });
  };

  const handleUndo = () => {
    if (historyState.index > 0) {
      if (debounceRef.current) clearTimeout(debounceRef.current);
      
      const newIndex = historyState.index - 1;
      const prevState = historyState.history[newIndex];
      
      setDocText(prevState.text);
      setBibEntries(prevState.bib);
      setHistoryState(prev => ({ ...prev, index: newIndex }));
    }
  };

  const handleRedo = () => {
    if (historyState.index < historyState.history.length - 1) {
      if (debounceRef.current) clearTimeout(debounceRef.current);

      const newIndex = historyState.index + 1;
      const nextState = historyState.history[newIndex];
      
      setDocText(nextState.text);
      setBibEntries(nextState.bib);
      setHistoryState(prev => ({ ...prev, index: newIndex }));
    }
  };

  // --- Event Handlers ---

  const handleTextChange = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    const newText = e.target.value;
    setDocText(newText);
    setShowTooltip(false);

    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      saveToHistory(newText, bibEntries);
    }, 1000);
  };

  const handleMouseUp = (e: React.MouseEvent<HTMLTextAreaElement>) => {
    const textarea = textAreaRef.current;
    if (!textarea) return;

    const start = textarea.selectionStart;
    const end = textarea.selectionEnd;
    const text = textarea.value.substring(start, end).trim();

    if (text.length > 5) {
      setSelection({ start, end, text });
      
      let x = e.clientX;
      let y = e.clientY;
      
      if (x + 150 > window.innerWidth) x = window.innerWidth - 160;
      if (y - 50 < 0) y = 60;

      setTooltipPos({ x, y: y - 50 });
      setShowTooltip(true);
    } else {
      setShowTooltip(false);
      setSelection(null);
    }
  };

  const handleCiteClick = async () => {
    if (!selection) return;
    setShowTooltip(false);
    setIsModalOpen(true);
    setSearchState({ isSearching: true, results: { suggested: [], related: [] }, error: null });

    try {
      const results = await searchForSources(selection.text, docText);
      setSearchState({ isSearching: false, results, error: null });
    } catch (err) {
      setSearchState({ 
        isSearching: false, 
        results: { suggested: [], related: [] }, 
        error: "Failed to fetch sources. Please check your API connection." 
      });
    }
  };

  const processCitation = async (source: Source) => {
    if (!selection) {
      alert("Please select the text where you want to insert the citation first.");
      return;
    }

    setIsFormatting(true);

    try {
      const result: CitationResult = await formatCitation(source, citationStyle);
      
      const before = docText.substring(0, selection.end);
      const after = docText.substring(selection.end);
      const spacer = before.endsWith(" ") ? "" : " "; 
      const newText = `${before}${spacer}${result.inText}${after}`;
      
      setDocText(newText);

      let newBibs = [...bibEntries];
      const exists = bibEntries.some(e => e.text === result.bibliography);
      
      if (!exists) {
        const newEntry: BibliographyEntry = {
          id: crypto.randomUUID(),
          text: result.bibliography,
          source: source
        };
        newBibs = [...bibEntries, newEntry].sort((a, b) => a.text.localeCompare(b.text));
        setBibEntries(newBibs);
      }
      
      // Save to history immediately
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveToHistory(newText, newBibs);

      setIsModalOpen(false);
      setIsLibraryOpen(false);
      setSelection(null);
    } catch (error) {
      console.error("Error applying citation", error);
    } finally {
      setIsFormatting(false);
    }
  };

  const handleSaveToLibrary = (source: Source) => {
    const exists = library.some(s => s.url === source.url || s.title === source.title);
    if (exists) {
      alert("Source already in library.");
      return;
    }
    const newSource = { ...source, id: crypto.randomUUID(), dateAdded: new Date().toISOString() };
    setLibrary(prev => [...prev, newSource]);
  };

  const handleRemoveFromLibrary = (id: string) => {
    if(window.confirm("Remove this source from your library?")) {
      setLibrary(prev => prev.filter(s => s.id !== id));
    }
  };

  const handleFileUpload = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;

    setIsProcessingFile(true);
    try {
      const text = await parseDocument(file);
      setDocText(text);
      
      let newBibs = bibEntries;
      if (window.confirm("Start a new bibliography for this document?")) {
        newBibs = [];
        setBibEntries([]);
      }
      
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveToHistory(text, newBibs);

    } catch (error) {
      alert("Error reading file: " + (error as Error).message);
    } finally {
      setIsProcessingFile(false);
      if (fileInputRef.current) fileInputRef.current.value = "";
    }
  };

  const handleClearBib = () => {
    if (window.confirm("Are you sure you want to clear the bibliography?")) {
      setBibEntries([]);
      if (debounceRef.current) clearTimeout(debounceRef.current);
      saveToHistory(docText, []);
    }
  };

  // Export handlers
  const handleExportPDF = () => {
    setShowExportMenu(false);
    exportToPdf('print-content', 'ScholarCite_Document.pdf');
  };

  const handleExportWord = async () => {
    try {
      await exportToWord(docText, bibEntries, citationStyle);
    } catch (error) {
      console.error(error);
      alert("Failed to generate Word document.");
    }
    setShowExportMenu(false);
  };

  const handleExportPptx = async () => {
    try {
      await exportToPptx(docText, bibEntries, citationStyle);
    } catch (error) {
      console.error(error);
      alert("Failed to generate PowerPoint presentation.");
    }
    setShowExportMenu(false);
  };

  const renderPdfContent = (text: string) => {
    const unicodeItalicRegex = /𝑒𝑡 𝑎𝑙\./gu;
    const parts = text.split(unicodeItalicRegex);
    return parts.map((part, i) => (
      <React.Fragment key={i}>
        {part}
        {i < parts.length - 1 && <em className="italic">et al.</em>}
      </React.Fragment>
    ));
  };

  return (
    <div className="min-h-screen pb-20">
      
      {/* Navbar */}
      <nav className="bg-white border-b border-gray-200 sticky top-0 z-30 no-print">
        <div className="max-w-5xl mx-auto px-6 h-16 flex items-center justify-between">
          <div className="flex items-center gap-2">
             <div className="bg-blue-600 text-white p-1.5 rounded-lg">
                <Sparkles className="w-5 h-5" />
             </div>
             <h1 className="text-xl font-bold text-gray-900 tracking-tight">ScholarCite</h1>
          </div>
          
          <div className="flex items-center gap-4">
            
            {/* Undo/Redo Group */}
            <div className="flex items-center gap-1 bg-gray-50 p-1 rounded-md border border-gray-200 mr-2">
              <button 
                onClick={handleUndo} 
                disabled={historyState.index <= 0}
                className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-white rounded disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Undo"
              >
                <Undo className="w-4 h-4" />
              </button>
              <button 
                onClick={handleRedo} 
                disabled={historyState.index >= historyState.history.length - 1}
                className="p-1.5 text-gray-600 hover:text-blue-600 hover:bg-white rounded disabled:opacity-30 disabled:hover:bg-transparent transition-all"
                title="Redo"
              >
                <Redo className="w-4 h-4" />
              </button>
            </div>

            <button
              onClick={() => setIsLibraryOpen(true)}
              className="flex items-center gap-2 text-gray-700 hover:text-blue-600 transition-colors text-sm font-medium mr-2"
            >
              <BookMarked className="w-4 h-4" />
              Library {library.length > 0 && <span className="bg-blue-100 text-blue-800 text-xs px-1.5 rounded-full">{library.length}</span>}
            </button>

            <div className="w-px h-6 bg-gray-200 mx-1"></div>

            <input 
              type="file" 
              ref={fileInputRef}
              onChange={handleFileUpload}
              accept=".docx,.doc,.pdf,.txt,.pptx"
              className="hidden"
            />
            <button 
              onClick={() => fileInputRef.current?.click()}
              disabled={isProcessingFile}
              className="flex items-center gap-2 text-gray-600 hover:text-blue-600 transition-colors text-sm font-medium"
            >
              <Upload className="w-4 h-4" />
              {isProcessingFile ? "Reading..." : "Upload Doc"}
            </button>

            <div className="relative">
              <button 
                onClick={() => setShowExportMenu(!showExportMenu)}
                className="flex items-center gap-2 bg-gray-900 text-white px-4 py-2 rounded-md text-sm font-medium hover:bg-black transition-colors"
              >
                <Download className="w-4 h-4" />
                Export
              </button>
              
              {showExportMenu && (
                <>
                  <div 
                    className="fixed inset-0 z-10" 
                    onClick={() => setShowExportMenu(false)}
                  ></div>
                  <div className="absolute right-0 mt-2 w-52 bg-white rounded-lg shadow-xl border border-gray-100 z-20 py-1 overflow-hidden animate-in fade-in zoom-in-95 duration-100">
                    <button 
                      onClick={handleExportPDF}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <FileText className="w-4 h-4 text-red-500" /> Save as PDF
                    </button>
                    <button 
                      onClick={handleExportWord}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <File className="w-4 h-4 text-blue-600" /> Save as Word
                    </button>
                    <button 
                      onClick={handleExportPptx}
                      className="w-full text-left px-4 py-2 text-sm text-gray-700 hover:bg-gray-50 flex items-center gap-2"
                    >
                      <Presentation className="w-4 h-4 text-orange-500" /> Save as PowerPoint
                    </button>
                  </div>
                </>
              )}
            </div>

            <div className="w-px h-6 bg-gray-200 mx-1"></div>

            <div className="flex items-center gap-2 bg-gray-50 px-3 py-1.5 rounded-md border border-gray-200">
               <Settings2 className="w-4 h-4 text-gray-500" />
               <select 
                value={citationStyle}
                onChange={(e) => setCitationStyle(e.target.value as CitationStyle)}
                className="bg-transparent text-sm font-medium text-gray-700 outline-none cursor-pointer"
               >
                 {CITATION_STYLES.map(style => (
                   <option key={style} value={style}>{style}</option>
                 ))}
               </select>
            </div>
          </div>
        </div>
      </nav>

      {/* Main Content (Screen View) */}
      <main className="max-w-5xl mx-auto px-6 py-8 no-print">
        
        <div className="relative">
          <div className="bg-white rounded-lg paper-shadow min-h-[600px] p-12 relative group">
            
            {showTooltip && (
              <div 
                ref={tooltipRef}
                className="fixed z-50 animate-in fade-in slide-in-from-bottom-2 duration-200"
                style={{
                  top: tooltipPos.y,
                  left: tooltipPos.x,
                }}
              >
                <button
                  onClick={handleCiteClick}
                  className="bg-gray-900 text-white px-4 py-2 rounded-full shadow-xl flex items-center gap-2 hover:bg-black transition-colors transform hover:scale-105"
                >
                  <Sparkles className="w-4 h-4 text-yellow-300" />
                  <span className="text-sm font-medium">Find Citation</span>
                </button>
              </div>
            )}

            {/* Backdrop for Highlights */}
            <div 
              ref={backdropRef}
              className="absolute inset-0 p-12 pointer-events-none font-serif text-lg leading-loose whitespace-pre-wrap break-words overflow-hidden"
              style={{ color: 'transparent', zIndex: 1 }}
              aria-hidden="true"
            >
              {renderHighlights(docText)}
              {/* Ensure trailing newlines are rendered */}
              {docText.endsWith('\n') && <br />}
            </div>

            {/* Foreground Textarea */}
            <textarea
              ref={textAreaRef}
              value={docText}
              onChange={handleTextChange}
              onScroll={handleScroll}
              onSelect={() => {}} // handled via mouseup for coords
              onMouseUp={handleMouseUp}
              className="relative w-full h-full min-h-[500px] resize-none outline-none font-serif text-lg leading-loose text-gray-800 placeholder-gray-300 bg-transparent selection:bg-blue-100 selection:text-blue-900"
              style={{ zIndex: 10 }}
              placeholder="Start typing your research paper here... or upload a document."
              spellCheck={false}
            />
          </div>
          
          <div className="mt-4 text-center text-gray-400 text-sm">
            Select any sentence or paragraph to search for academic sources.
          </div>
        </div>

        <Bibliography 
          entries={bibEntries} 
          style={citationStyle} 
          onClear={handleClearBib}
        />

      </main>

      <div id="print-content" className="max-w-5xl mx-auto hidden">
        <div className="p-12 bg-white">
          <div className="font-serif text-lg leading-relaxed text-gray-900 whitespace-pre-wrap mb-12">
            {renderPdfContent(docText)}
          </div>
          
          {bibEntries.length > 0 && (
            <div className="page-break">
               <h2 className="text-2xl font-bold mb-6 font-serif">Bibliography</h2>
               <p className="text-sm text-gray-500 mb-6">Style: {citationStyle}</p>
               <ul className="space-y-4">
                 {bibEntries.map((entry) => (
                   <li key={entry.id} className="pl-8 -indent-8 font-serif leading-relaxed text-lg">
                     {entry.text.split(/(\*.*?\*)/g).map((part, i) => 
                        (part.startsWith('*') && part.endsWith('*')) 
                          ? <em key={i} className="italic">{part.slice(1, -1)}</em> 
                          : <span key={i}>{part}</span>
                     )}
                   </li>
                 ))}
               </ul>
            </div>
          )}
        </div>
      </div>

      <CitationModal 
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        query={selection?.text || ""}
        searchState={searchState}
        onSelectSource={processCitation}
        onSaveToLibrary={handleSaveToLibrary}
        isFormatting={isFormatting}
      />

      <CitationManager 
        isOpen={isLibraryOpen}
        onClose={() => setIsLibraryOpen(false)}
        library={library}
        onCite={processCitation}
        onDelete={handleRemoveFromLibrary}
        onAdd={(source) => setLibrary(prev => [...prev, source])}
        isFormatting={isFormatting}
      />
    </div>
  );
}

export default App;
