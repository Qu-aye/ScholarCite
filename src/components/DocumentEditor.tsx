import React, { useState, useEffect, useRef } from 'react';
import { useEditor, EditorContent } from '@tiptap/react';
import StarterKit from '@tiptap/starter-kit';
import { Mark, mergeAttributes } from '@tiptap/core';
import { searchSources, Source } from '../services/searchService';
import { Sparkles, BookOpen, Search, Check, AlertCircle, FileText, Loader2, BookMarked, X, Settings2, Calendar, ArrowUpDown, Plus, ChevronDown, ChevronRight, ArrowLeft } from 'lucide-react';

// Helper to compile citations for manually added custom items
export function compileCustomSourceCitations(customData: {
  title: string;
  author: string;
  year: string;
  doi?: string;
  journal?: string;
  volume?: string;
  issue?: string;
  page?: string;
  overrideInText?: string;
  overrideFull?: string;
}) {
  const { title, author, year, doi, journal, volume, issue, page, overrideInText, overrideFull } = customData;
  const cleanDoi = doi ? (doi.startsWith('https://doi.org/') ? doi.replace('https://doi.org/', '') : doi) : '';
  const authorClean = author.trim() || 'Unknown Author';
  
  // Harvard formatted full citation
  let harvardFull = overrideFull || `${authorClean} (${year}) '${title}'`;
  if (!overrideFull) {
    if (journal) harvardFull += `, *${journal}*`;
    if (volume) {
      harvardFull += `, ${volume}`;
      if (issue) harvardFull += `(${issue})`;
    } else if (issue) {
      harvardFull += `, (${issue})`;
    }
    if (page) harvardFull += `, pp. ${page}`;
    if (cleanDoi) harvardFull += `. https://doi.org/${cleanDoi}`;
    else harvardFull += '.';
  }

  // APA formatted full citation
  let apaFull = overrideFull || `${authorClean} (${year}). ${title}`;
  if (!overrideFull) {
    if (journal) apaFull += `. *${journal}*`;
    if (volume) {
      apaFull += `, *${volume}*`;
      if (issue) apaFull += `(${issue})`;
    }
    if (page) apaFull += `, ${page}`;
    if (cleanDoi) apaFull += `. https://doi.org/${cleanDoi}`;
    else apaFull += '.';
  }

  // MLA formatted full citation
  let mlaFull = overrideFull || `${authorClean}. "${title}."`;
  if (!overrideFull) {
    if (journal) mlaFull += ` *${journal}*`;
    if (volume) mlaFull += `, vol. ${volume}`;
    if (issue) mlaFull += `, no. ${issue}`;
    mlaFull += `, ${year}`;
    if (page) mlaFull += `, pp. ${page}`;
    if (cleanDoi) mlaFull += `. https://doi.org/${cleanDoi}`;
    else mlaFull += '.';
  }

  // Chicago formatted full citation
  let chicagoFull = overrideFull || `${authorClean}. ${year}. "${title}."`;
  if (!overrideFull) {
    if (journal) chicagoFull += ` *${journal}*`;
    if (volume) {
      chicagoFull += ` ${volume}`;
      if (issue) chicagoFull += ` (${issue})`;
    }
    if (page) chicagoFull += `: ${page}`;
    if (cleanDoi) chicagoFull += `. https://doi.org/${cleanDoi}`;
    else chicagoFull += '.';
  }

  // In-text markers
  const harvardInText = overrideInText || `(${authorClean}, ${year})`;
  const apaInText = overrideInText || `(${authorClean}, ${year})`;
  const mlaInText = overrideInText || `(${authorClean}, ${year})`;
  const chicagoInText = overrideInText || `(${authorClean} ${year})`;

  return {
    harvard: {
      inText: harvardInText,
      full: harvardFull,
    },
    apa: {
      inText: apaInText,
      full: apaFull,
    },
    mla: {
      inText: mlaInText,
      full: mlaFull,
    },
    chicago: {
      inText: chicagoInText,
      full: chicagoFull,
    },
  };
}

export const AcademicCitation = Mark.create({
  name: 'academicCitation',

  addAttributes() {
    return {
      doi: {
        default: null,
        parseHTML: element => element.getAttribute('data-doi'),
        renderHTML: attributes => {
          if (!attributes.doi) {
            return {};
          }
          return {
            'data-doi': attributes.doi,
          };
        },
      },
      style: {
        default: null,
        parseHTML: element => element.getAttribute('data-citation-style'),
        renderHTML: attributes => {
          if (!attributes.style) {
            return {};
          }
          return {
            'data-citation-style': attributes.style,
          };
        },
      },
    };
  },

  parseHTML() {
    return [
      {
        tag: 'span.academic-citation',
      },
      {
        tag: 'span[data-doi]',
      },
    ];
  },

  renderHTML({ HTMLAttributes }) {
    return ['span', mergeAttributes({ class: 'academic-citation' }, HTMLAttributes), 0];
  },
});


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
  const [searchError, setSearchError] = useState<string | null>(null);
  const [menuCoords, setMenuCoords] = useState<{ x: number; y: number } | null>(null);
  const [insertPosition, setInsertPosition] = useState<number | null>(null);

  // Filter, sort and manual citation states within the citation dialogue
  const [timeFilter, setTimeFilter] = useState<'all' | '5y' | '10y' | '20y'>('all');
  const [sortOption, setSortOption] = useState<'relevance' | 'newest' | 'oldest'>('relevance');
  const [isAddingCustom, setIsAddingCustom] = useState(false);

  // Form fields for custom citation manual additions
  const [customTitle, setCustomTitle] = useState('');
  const [customAuthor, setCustomAuthor] = useState('');
  const [customYear, setCustomYear] = useState('');
  const [customJournal, setCustomJournal] = useState('');
  const [customDoi, setCustomDoi] = useState('');
  const [customVolume, setCustomVolume] = useState('');
  const [customIssue, setCustomIssue] = useState('');
  const [customPage, setCustomPage] = useState('');
  const [showOverrides, setShowOverrides] = useState(false);
  const [overrideInText, setOverrideInText] = useState('');
  const [overrideFull, setOverrideFull] = useState('');
  const [customFormError, setCustomFormError] = useState('');

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

  // Citation validation and auto-fixing overlay state
  const [hoveredCitation, setHoveredCitation] = useState<{
    doi: string | null;
    text: string;
    rect: { left: number; top: number; width: number; height: number; bottom: number; right: number };
    expectedText: string;
    issues: {
      type: string;
      message: string;
      suggestion: string;
      canFix: boolean;
    }[];
  } | null>(null);

  const closeTimeoutRef = useRef<NodeJS.Timeout | null>(null);

  const startCloseTimeout = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
    closeTimeoutRef.current = setTimeout(() => {
      setHoveredCitation(null);
    }, 280); // 280ms threshold allows smooth cursor traversal to tooltip
  };

  const cancelCloseTimeout = () => {
    if (closeTimeoutRef.current) clearTimeout(closeTimeoutRef.current);
  };

  const editor = useEditor({
    extensions: [StarterKit, AcademicCitation],
    content: content,
    editorProps: {
      handleClick: (view, pos, event) => {
        const target = event.target as HTMLElement;
        const citationEl = target.closest('.academic-citation');
        if (citationEl) {
          const doi = citationEl.getAttribute('data-doi');
          if (doi) {
            const bibElement = document.getElementById(`bib-${doi}`);
            if (bibElement) {
              bibElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
              bibElement.classList.add('bibliography-highlighted');
              setTimeout(() => {
                const el = document.getElementById(`bib-${doi}`);
                if (el) {
                  el.classList.remove('bibliography-highlighted');
                }
              }, 1800);
            }
          }
          return true;
        }
        return false;
      }
    },
    onSelectionUpdate: ({ editor }) => {
      const { from, to } = editor.state.selection;
      if (from === to) {
        setMenuCoords(null);
        return;
      }

      // Proactively capture the highlighted text and exact insertion index
      // so it is locked in when the user attempts to trigger the floating button
      const text = editor.state.doc.textBetween(from, to, ' ');
      if (text && text.trim().length > 0) {
        setSelectedText(text);
        setInsertPosition(to);
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

  const fixStandaloneCitationText = (text: string): string => {
    let clean = text.trim();
    // Strip parenthetical wrappers first to normalize
    clean = clean.replace(/^[([\s]+|[\])\s]+$/g, '');
    return `(${clean})`;
  };

  const checkCitationIssues = (text: string, doi: string | null, activeStyle: string) => {
    const issues: { type: string; message: string; suggestion: string; canFix: boolean }[] = [];
    const source = doi ? bibliography.find(s => s.doi === doi) : null;
    const cleanText = text.trim();
    
    // Bracket mismatch and missing checks
    const hasCorrectBrackets = (cleanText.startsWith('(') && cleanText.endsWith(')')) || 
                               (cleanText.startsWith('[') && cleanText.endsWith(']'));
    const isMismatched = (cleanText.startsWith('(') && !cleanText.endsWith(')')) ||
                         (!cleanText.startsWith('(') && cleanText.endsWith(')')) ||
                         (cleanText.startsWith('[') && !cleanText.endsWith(']')) ||
                         (!cleanText.startsWith('[') && cleanText.endsWith(']'));
                         
    if (isMismatched) {
      issues.push({
        type: 'bracket_mismatch',
        message: 'Mismatched brackets: Detected unclosed trailing or leading parenthetical brackets.',
        suggestion: 'Wrap properly in symmetrical parenthetical segments.',
        canFix: true
      });
    } else if (!hasCorrectBrackets && activeStyle !== 'mla') {
      issues.push({
        type: 'bracket_missing',
        message: 'Formatting guidelines specify parenthetical styling for this referencing profile.',
        suggestion: 'Enclose complete reference inside parenthetical wrappers.',
        canFix: true
      });
    }

    // Missing Year detection for year-based reference formats
    if (activeStyle !== 'mla') {
      const yearRegex = /\b(19|20)\d{2}\b/;
      if (!yearRegex.test(cleanText)) {
        issues.push({
          type: 'missing_year',
          message: 'Referencing standard requires a 4-digit publication calendar year.',
          suggestion: source?.year ? `Append registered source publication year "${source.year}"` : 'Introduce reference publication year.',
          canFix: !!source?.year
        });
      }
    }

    // Reference profile content out-of-sync checks (Style conformity validation)
    if (source) {
      const targetStyleCitations = source.citations?.[activeStyle as 'harvard' | 'apa' | 'mla' | 'chicago'];
      const expectedText = targetStyleCitations?.inText || '';
      
      if (expectedText && cleanText !== expectedText.trim()) {
        issues.push({
          type: 'improper_style_format',
          message: `In-text format diverges from active profile layout spec (${activeStyle.toUpperCase()}).`,
          suggestion: `Align exactly with style recommendation: "${expectedText}"`,
          canFix: true
        });
      }
    }

    return { issues, source };
  };

  const autoFixCitation = (doi: string, correctInText: string) => {
    if (!editor) return;
    
    let fixed = false;
    editor.state.doc.descendants((node, pos) => {
      if (fixed) return false;
      
      const citationMark = node.marks.find(m => 
        m.type.name === 'academicCitation' && 
        (doi ? m.attrs.doi === doi : true)
      );

      if (citationMark) {
        // Double-check element match if we are operating on non-registered inline elements
        if (!doi && node.textContent.trim() !== hoveredCitation?.text.trim()) {
          return true;
        }

        const from = pos;
        const to = pos + node.nodeSize;
        
        editor.chain()
          .focus()
          .insertContentAt({ from, to }, {
            type: 'text',
            text: correctInText,
            marks: [{
              type: 'academicCitation',
              attrs: {
                doi: doi || citationMark.attrs.doi || null,
                style: citationStyle
              }
            }]
          })
          .run();
          
        fixed = true;
        return false;
      }
    });
    
    setHoveredCitation(null);
  };

  // Setup citation validation tracker effects on the editor workspace
  useEffect(() => {
    if (!editorContainerRef.current) return;
    const container = editorContainerRef.current;

    const handleMouseOver = (e: MouseEvent) => {
      const target = e.target as HTMLElement;
      const citationEl = target.closest('.academic-citation') as HTMLElement;
      
      if (!citationEl) {
        startCloseTimeout();
        return;
      }

      cancelCloseTimeout();
      
      const doi = citationEl.getAttribute('data-doi');
      const text = citationEl.textContent || '';
      const rect = citationEl.getBoundingClientRect();
      const containerRect = container.getBoundingClientRect();

      const { issues, source } = checkCitationIssues(text, doi, citationStyle);

      if (issues.length > 0) {
        const relativeRect = {
          left: rect.left - containerRect.left,
          top: rect.top - containerRect.top,
          width: rect.width,
          height: rect.height,
          bottom: rect.bottom - containerRect.top,
          right: rect.right - containerRect.left
        };

        const expectedText = source?.citations?.[citationStyle]?.inText || fixStandaloneCitationText(text);

        setHoveredCitation({
          doi,
          text,
          rect: relativeRect,
          expectedText,
          issues
        });
      } else {
        setHoveredCitation(null);
      }
    };

    container.addEventListener('mouseover', handleMouseOver);
    return () => {
      container.removeEventListener('mouseover', handleMouseOver);
    };
  }, [bibliography, citationStyle, editor]);

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
    if (!selectedText || selectedText.trim().length === 0) return;
    
    setShowPopup(true);
    setIsLoading(true);
    setSearchError(null);
    setSearchResults([]); // Clear previous results instantly to avoid showing stale state
    setMenuCoords(null); // Hide active selection popup
    
    try {
      const results = await searchSources(selectedText);
      setSearchResults(results);
    } catch (err: any) {
      console.error(err);
      setSearchError(err.message || 'Failed to search academic literature indexes');
      setSearchResults([]);
    } finally {
      setIsLoading(false);
    }
  };

  const closePopup = () => {
    setShowPopup(false);
    setInsertPosition(null);
    setSearchError(null);
    setSearchResults([]); // Clear results on close to stay clean
    setIsAddingCustom(false);
    setTimeFilter('all');
    setSortOption('relevance');
    // Reset manual customized reference states
    setCustomTitle('');
    setCustomAuthor('');
    setCustomYear('');
    setCustomJournal('');
    setCustomDoi('');
    setCustomVolume('');
    setCustomIssue('');
    setCustomPage('');
    setShowOverrides(false);
    setOverrideInText('');
    setOverrideFull('');
    setCustomFormError('');
  };

  const handleInsertCustomCitation = (e: React.FormEvent) => {
    e.preventDefault();
    setCustomFormError('');

    if (!customTitle.trim() || !customAuthor.trim() || !customYear.trim()) {
      setCustomFormError('Please enter all required fields.');
      return;
    }

    // Format a Source entity representing manually input details
    const customSource: Source = {
      title: customTitle.trim(),
      author: customAuthor.trim(),
      year: customYear.trim(),
      doi: customDoi.trim() || undefined,
      journal: customJournal.trim() || undefined,
      volume: customVolume.trim() || undefined,
      issue: customIssue.trim() || undefined,
      page: customPage.trim() || undefined,
      citations: compileCustomSourceCitations({
        title: customTitle.trim(),
        author: customAuthor.trim(),
        year: customYear.trim(),
        doi: customDoi.trim() || undefined,
        journal: customJournal.trim() || undefined,
        volume: customVolume.trim() || undefined,
        issue: customIssue.trim() || undefined,
        page: customPage.trim() || undefined,
        overrideInText: overrideInText.trim() || undefined,
        overrideFull: overrideFull.trim() || undefined,
      }),
    };

    insertCitation(customSource);
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
    
    // Insert with academic-citation spans containing relevant data-doi to allow interaction hooks
    const doiClean = source.doi || '';
    const htmlInsert = ` <span class="academic-citation" data-doi="${doiClean}" data-citation-style="${citationStyle}">${inTextMarker}</span> `;
    editor.commands.insertContent(htmlInsert);
    
    // Immediately close modal pop-up so it leaves the screen
    setShowPopup(false);
    setInsertPosition(null);
  };

  // Process search results based on chosen filtering and sorting attributes live within the component
  const processedResults = searchResults.filter(source => {
    if (timeFilter === 'all') return true;
    const itemYear = parseInt(source.year, 10);
    if (isNaN(itemYear)) return true;
    const currentYear = new Date().getFullYear();
    if (timeFilter === '5y') return currentYear - itemYear <= 5;
    if (timeFilter === '10y') return currentYear - itemYear <= 10;
    if (timeFilter === '20y') return currentYear - itemYear <= 20;
    return true;
  }).sort((a, b) => {
    if (sortOption === 'newest') {
      const yearA = parseInt(a.year, 10) || 0;
      const yearB = parseInt(b.year, 10) || 0;
      return yearB - yearA;
    }
    if (sortOption === 'oldest') {
      const yearA = parseInt(a.year, 10) || 9999;
      const yearB = parseInt(b.year, 10) || 9999;
      return yearA - yearB;
    }
    return 0; // relevance
  });

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

        {/* Floating Citation Validation Overlay */}
        {hoveredCitation && (
          <div 
            id="citation-validation-tooltip"
            style={{ 
              left: `${hoveredCitation.rect.left + hoveredCitation.rect.width / 2}px`, 
              top: `${hoveredCitation.rect.bottom + 8}px` 
            }}
            className="absolute z-50 transform -translate-x-1/2 bg-slate-900 border border-slate-800 text-white rounded-xl shadow-xl p-4 w-76 flex flex-col space-y-3 font-sans transition-all duration-150 text-left"
            onMouseEnter={cancelCloseTimeout}
            onMouseLeave={startCloseTimeout}
          >
            <div className="flex items-start gap-2 text-rose-400">
              <AlertCircle className="w-4 h-4 shrink-0 mt-0.5" />
              <div className="space-y-0.5">
                <span className="text-[10px] uppercase font-mono font-bold tracking-wider">Formatting Issue Found</span>
                <p className="text-xs text-slate-100 font-medium leading-relaxed font-serif italic">
                  "{hoveredCitation.text}"
                </p>
              </div>
            </div>

            <div className="border-t border-slate-800 pt-2.5 space-y-2">
              {hoveredCitation.issues.map((issue, idx) => (
                <div key={idx} className="bg-slate-950/70 border border-slate-800/40 rounded-lg p-2.5 space-y-1">
                  <div className="text-rose-450 text-xxs font-semibold leading-relaxed">{issue.message}</div>
                  <div className="text-slate-400 text-[10px] font-medium leading-tight">
                    Suggestion: <span className="text-indigo-300 font-semibold">{issue.suggestion}</span>
                  </div>
                </div>
              ))}
            </div>

            <div className="flex gap-2 pt-1.5 border-t border-slate-800 text-[10px] justify-end">
              <button 
                onClick={() => setHoveredCitation(null)}
                className="px-2.5 py-1.5 rounded-lg text-slate-400 hover:text-white hover:bg-slate-800/80 transition-colors cursor-pointer font-bold"
              >
                Dismiss
              </button>
              {hoveredCitation.issues.some(issue => issue.canFix) && (
                <button
                  onClick={() => {
                    if (hoveredCitation.doi) {
                      autoFixCitation(hoveredCitation.doi, hoveredCitation.expectedText);
                    } else {
                      const fixed = fixStandaloneCitationText(hoveredCitation.text);
                      autoFixCitation('', fixed);
                    }
                  }}
                  className="flex items-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white font-bold px-3 py-1.5 rounded-lg transition-all cursor-pointer shadow-md transform hover:scale-[1.02] active:scale-[0.98]"
                >
                  <Sparkles className="w-3.5 h-3.5 text-teal-300 animate-pulse" />
                  Auto-Fix
                </button>
              )}
            </div>
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
                  <div key={source.doi || index} id={`bib-${source.doi || index}`} className="bg-stone-50/50 border-l-4 border-indigo-600 p-5 rounded-r-xl font-serif font-medium text-sm text-slate-800 leading-relaxed break-words shadow-xxs">
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

            {/* Filters, sorting and custom action row with visual consistency with screenshot */}
            <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 p-3.5 bg-slate-50 border border-slate-150 rounded-xl">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="text-xs font-bold text-slate-800 font-sans tracking-tight">Citations</span>
                
                <div className="flex items-center gap-1.5 flex-wrap">
                  {/* Time Filter Settings */}
                  <div className="relative flex items-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-705 rounded-lg shadow-xxs transition-colors py-1 px-2.5 cursor-pointer max-w-[125px]">
                    <Calendar className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
                    <select
                      value={timeFilter}
                      onChange={(e) => setTimeFilter(e.target.value as any)}
                      className="text-[11px] font-sans font-semibold text-slate-700 bg-transparent border-0 outline-none pr-4 py-0.5 appearance-none cursor-pointer"
                    >
                      <option value="all">All time</option>
                      <option value="5y">Past 5 years</option>
                      <option value="10y">Past 10 years</option>
                      <option value="20y">Past 20 years</option>
                    </select>
                    <ChevronDown className="w-3" />
                  </div>

                  {/* Sort Selection */}
                  <div className="relative flex items-center bg-white border border-slate-200 hover:bg-slate-50 text-slate-705 rounded-lg shadow-xxs transition-colors py-1 px-2.5 cursor-pointer max-w-[125px]">
                    <ArrowUpDown className="w-3.5 h-3.5 text-slate-400 mr-1.5 shrink-0" />
                    <select
                      value={sortOption}
                      onChange={(e) => setSortOption(e.target.value as any)}
                      className="text-[11px] font-sans font-semibold text-slate-700 bg-transparent border-0 outline-none pr-4 py-0.5 appearance-none cursor-pointer"
                    >
                      <option value="relevance">Relevance</option>
                      <option value="newest">Newest</option>
                      <option value="oldest">Oldest</option>
                    </select>
                    <ChevronDown className="w-3" />
                  </div>
                </div>
              </div>

              {/* Add Custom Trigger Link/Button */}
              {!isAddingCustom ? (
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(true)}
                  className="flex items-center gap-1 text-[11px] font-bold text-indigo-600 hover:text-indigo-800 transition-colors uppercase tracking-wider font-sans sm:ml-auto cursor-pointer"
                >
                  <Plus className="w-3.5 h-3.5" />
                  Add custom citation
                </button>
              ) : (
                <button
                  type="button"
                  onClick={() => setIsAddingCustom(false)}
                  className="flex items-center gap-1.5 text-[11px] font-bold text-slate-500 hover:text-slate-850 transition-colors uppercase tracking-wider font-sans sm:ml-auto cursor-pointer"
                >
                  <ArrowLeft className="w-3.5 h-3.5 mr-0.5" />
                  Back to active list
                </button>
              )}
            </div>

            {/* Results Body column or Custom Add View */}
            <div className="flex-1 overflow-y-auto min-h-[220px] pr-1">
              {isAddingCustom ? (
                <form onSubmit={handleInsertCustomCitation} className="space-y-4 py-2 border border-slate-150 p-4 rounded-xl bg-slate-50/20">
                  <div className="flex items-center gap-2 pb-1 border-b border-slate-100">
                    <BookMarked className="w-4 h-4 text-indigo-600" />
                    <h5 className="text-xs font-sans font-bold text-slate-700 uppercase tracking-wider">Add Custom Reference</h5>
                  </div>

                  {customFormError && (
                    <div className="flex items-start gap-2.5 p-3 bg-rose-50 border border-rose-200/50 rounded-xl text-xs text-rose-705 font-sans leading-relaxed">
                      <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
                      <span>{customFormError}</span>
                    </div>
                  )}

                  <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                    <div className="sm:col-span-2">
                      <label className="block text-[10px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                        Document Title *
                      </label>
                      <input
                        type="text"
                        value={customTitle}
                        onChange={(e) => setCustomTitle(e.target.value)}
                        placeholder="e.g., Deep Learning in Academic Writing"
                        className="w-full border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 bg-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                        Author(s) *
                      </label>
                      <input
                        type="text"
                        value={customAuthor}
                        onChange={(e) => setCustomAuthor(e.target.value)}
                        placeholder="e.g., Seworna, A. and Smith, J."
                        className="w-full border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 bg-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                        Publication Year *
                      </label>
                      <input
                        type="text"
                        value={customYear}
                        onChange={(e) => setCustomYear(e.target.value)}
                        placeholder="e.g., 2024"
                        maxLength={10}
                        className="w-full border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 bg-white"
                        required
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                        Journal or Book Title / Publisher
                      </label>
                      <input
                        type="text"
                        value={customJournal}
                        onChange={(e) => setCustomJournal(e.target.value)}
                        placeholder="e.g., International Journal of AI Studies"
                        className="w-full border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-800 outline-none transition-all placeholder:text-slate-400 bg-white"
                      />
                    </div>

                    <div>
                      <label className="block text-[10px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                        DOI or Identifier URL (optional)
                      </label>
                      <input
                        type="text"
                        value={customDoi}
                        onChange={(e) => setCustomDoi(e.target.value)}
                        placeholder="e.g., 10.1016/j.ai.2024.1235"
                        className="w-full border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-3 py-2 text-xs text-slate-805 outline-none transition-all placeholder:text-slate-400 bg-white font-mono"
                      />
                    </div>

                    <div className="grid grid-cols-3 gap-2 sm:col-span-2">
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                          Volume
                        </label>
                        <input
                          type="text"
                          value={customVolume}
                          onChange={(e) => setCustomVolume(e.target.value)}
                          placeholder="e.g., 12"
                          className="w-full border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-2.5 py-2 text-xs text-slate-805 outline-none transition-all placeholder:text-slate-400 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                          Issue
                        </label>
                        <input
                          type="text"
                          value={customIssue}
                          onChange={(e) => setCustomIssue(e.target.value)}
                          placeholder="e.g., 4"
                          className="w-full border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-2.5 py-2 text-xs text-slate-850 outline-none transition-all placeholder:text-slate-400 bg-white"
                        />
                      </div>
                      <div>
                        <label className="block text-[10px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                          Pages
                        </label>
                        <input
                          type="text"
                          value={customPage}
                          onChange={(e) => setCustomPage(e.target.value)}
                          placeholder="e.g., 34-45"
                          className="w-full border border-slate-200 focus:border-indigo-500 focus:ring-1 focus:ring-indigo-500 rounded-xl px-2.5 py-2 text-xs text-slate-850 outline-none transition-all placeholder:text-slate-400 bg-white"
                        />
                      </div>
                    </div>
                  </div>

                  {/* Overrides block */}
                  <div className="pt-2">
                    <button
                      type="button"
                      onClick={() => setShowOverrides(!showOverrides)}
                      className="flex items-center gap-1.5 text-[10px] font-bold text-indigo-600 hover:text-indigo-850 uppercase tracking-wider font-sans cursor-pointer focus:outline-none"
                    >
                      <ChevronRight className={`w-3.5 h-3.5 transform transition-transform duration-250 ${showOverrides ? 'rotate-90' : ''}`} />
                      Manual Formatting Overrides (Advanced)
                    </button>
                    
                    {showOverrides && (
                      <div className="mt-3 p-3 bg-slate-50 border border-slate-150 rounded-xl space-y-3 animate-in slide-in-from-top-2 duration-200">
                        <p className="text-[10px] text-slate-550 leading-relaxed font-sans">
                          Specifying manual overrides ignores auto-generation rules and outputs exact characters provided below.
                        </p>
                        <div className="grid grid-cols-1 gap-2.5">
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                              In-text format override
                            </label>
                            <input
                              type="text"
                              value={overrideInText}
                              onChange={(e) => setOverrideInText(e.target.value)}
                              placeholder="e.g., (Seworna and Smith, 2024)"
                              className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-slate-800 outline-none transition-all bg-white font-sans"
                            />
                          </div>
                          <div>
                            <label className="block text-[9px] font-bold text-slate-400 font-sans uppercase tracking-wider mb-1">
                              Full reference list override
                            </label>
                            <textarea
                              value={overrideFull}
                              onChange={(e) => setOverrideFull(e.target.value)}
                              placeholder="e.g., Seworna, A., Smith, J. (2024) Deep Learning in Academic Writing. International Journal of AI Studies, 12(4), pp. 34-45."
                              rows={2}
                              className="w-full border border-slate-200 focus:border-indigo-500 rounded-xl px-3 py-1.5 text-xs text-slate-800 outline-none transition-all bg-white font-serif"
                            />
                          </div>
                        </div>
                      </div>
                    )}
                  </div>

                  <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2 px-1">
                    <button
                      type="button"
                      onClick={() => setIsAddingCustom(false)}
                      className="px-3 py-2 border border-slate-250 rounded-xl text-xs font-semibold font-sans text-slate-650 hover:bg-slate-50 transition-all cursor-pointer"
                    >
                      Cancel
                    </button>
                    <button
                      type="submit"
                      className="px-4 py-2 bg-indigo-600 hover:bg-indigo-750 text-white font-semibold font-sans rounded-xl text-xs transition-all shadow-sm flex items-center gap-1.5 hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                    >
                      <span>Insert custom entry</span>
                    </button>
                  </div>
                </form>
              ) : isLoading ? (
                <div className="flex flex-col items-center justify-center py-12 space-y-3">
                  <Loader2 className="w-8 h-8 text-indigo-600 animate-spin" />
                  <span className="text-xs text-slate-500 font-semibold font-sans tracking-wide">Querying catalogues & registries (including Google Scholar)...</span>
                </div>
              ) : searchError ? (
                <div className="flex flex-col items-center justify-center py-10 bg-rose-50 rounded-xl border border-rose-200/50 text-center space-y-2 p-5 text-rose-705">
                  <AlertCircle className="w-6 h-6 text-rose-500 mx-auto" />
                  <p className="text-xs font-bold font-sans">Search Gateway Limit Encountered</p>
                  <p className="text-xxs font-sans max-w-[325px] mx-auto leading-relaxed">
                    {searchError}
                  </p>
                </div>
              ) : searchResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 bg-slate-50 rounded-xl border border-dashed border-slate-200 text-center space-y-2">
                  <AlertCircle className="w-6 h-6 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-705 font-sans">No matching literature indexes identified</p>
                  <p className="text-xxs text-slate-400 font-sans max-w-[320px] mx-auto leading-relaxed">
                    Try highlight-selecting a simpler key phrase or active claim segment
                  </p>
                </div>
              ) : searchResults.length > 0 && processedResults.length === 0 ? (
                <div className="flex flex-col items-center justify-center py-10 bg-slate-50 border border-dashed border-slate-200 rounded-xl text-center space-y-2">
                  <AlertCircle className="w-6 h-6 text-slate-400" />
                  <p className="text-xs font-semibold text-slate-755 font-sans">No matches in chosen time filter</p>
                  <p className="text-xxs text-slate-450 font-sans max-w-[280px] mx-auto leading-relaxed">
                    Try setting the date filter to "All time" to reveal all matching literature references.
                  </p>
                </div>
              ) : (
                <div className="space-y-4">
                  <div className="flex items-center justify-between px-1">
                    <span className="text-xxs font-bold text-slate-400 uppercase tracking-wider font-sans">Found Citations:</span>
                    <span className="text-xxs font-bold font-sans bg-indigo-50 text-indigo-755 px-2.5 py-0.5 rounded-full border border-indigo-100">
                      {processedResults.length} Matches Displayed
                    </span>
                  </div>
                  
                  <div className="max-h-[600px] overflow-y-auto custom-scrollbar border border-slate-200 rounded-md p-4">
                    {processedResults.map((source, index) => {
                      const citationData = source.citations?.[citationStyle];
                      const inTextMarker = citationData?.inText || `[${source.author}, ${source.year}]`;
                      return (
                        <div 
                          key={source.doi || index} 
                          onClick={() => insertCitation(source)}
                          className="hover:bg-indigo-50/20 cursor-pointer p-3 mb-2 border-b last:border-0 transition-colors flex flex-col gap-2 rounded-lg"
                        >
                          <h5 className="text-xs font-sans font-bold text-slate-800 leading-snug hover:text-indigo-600 transition-colors">
                            {source.title}
                          </h5>
                          
                          <div className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[10px] text-slate-500 font-sans font-medium">
                            <span className="font-bold text-slate-650">{source.author}</span>
                            <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                            <span>{source.year}</span>
                            {source.doi && (
                              <>
                                <span className="w-1 h-1 rounded-full bg-slate-300"></span>
                                <span className="font-mono text-[9px] text-slate-405">{source.doi}</span>
                              </>
                            )}
                          </div>

                          {/* Quick preview styled with same .academic-citation tag for absolute visual matching */}
                          <div className="flex items-center justify-between p-2.5 bg-slate-50/70 border border-slate-100 rounded-xl text-[11px] transition-colors">
                            <span className="text-slate-500 font-sans font-medium">In-text preview:</span>
                            <span className="academic-citation scale-95 origin-right">
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
