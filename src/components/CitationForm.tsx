import React, { useState } from 'react';
import { generateCitation } from '../services/citationService';
import { BookOpen, AlertCircle, Loader2, Clipboard, Check } from 'lucide-react';

export default function CitationForm() {
  const [doi, setDoi] = useState('');
  const [citation, setCitation] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [copied, setCopied] = useState(false);
  const [activeStyle, setActiveStyle] = useState('apa');

  const handleSubmit = async (e: React.FormEvent, selectedStyle = activeStyle) => {
    if (e) e.preventDefault();
    if (!doi.trim()) return;

    setLoading(true);
    setError('');
    setCitation('');
    setCopied(false);

    try {
      const result = await generateCitation(doi, selectedStyle);
      setCitation(result);
    } catch (err) {
      setError('Failed to resolve academic metadata. Please verify the DOI is valid (e.g. 10.1038/s41586-021-03491-6).');
    } finally {
      setLoading(false);
    }
  };

  const handleStyleChange = async (style: string) => {
    setActiveStyle(style);
    if (doi.trim() && citation) {
      // Re-fetch or re-render using selected style
      const mockEvent = { preventDefault: () => {} } as React.FormEvent;
      await handleSubmit(mockEvent, style);
    }
  };

  const handleCopy = () => {
    if (!citation) return;
    navigator.clipboard.writeText(citation.trim());
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  return (
    <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6 flex flex-col space-y-4" id="doi-citation-form">
      <div className="flex items-center gap-2.5">
        <BookOpen className="w-5 h-5 text-blue-900" />
        <div>
          <h2 className="text-xl font-serif font-bold text-slate-800">DOI Citation Converter</h2>
          <p className="text-xs text-slate-500 font-sans mt-0.5">Rapidly look up DOIs & format bibliographies via CrossRef registries</p>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(e)} className="space-y-4">
        <div>
          <label htmlFor="doi" className="block text-xs font-semibold text-slate-600 font-sans uppercase tracking-wider mb-2">
            Digital Object Identifier (DOI)
          </label>
          <input
            type="text"
            id="doi"
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            className="w-full border border-slate-300 rounded-md px-4 py-3 focus:ring-2 focus:ring-teal-500 focus:border-teal-500 bg-white text-slate-800 outline-none transition-shadow font-mono text-sm placeholder:font-sans"
            placeholder="e.g., 10.1038/s41586-021-03491-6"
            required
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-3 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xs font-bold text-slate-500 font-sans uppercase mr-1">Output Style:</span>
            {['apa', 'harvard', 'vancouver', 'chicago-author-date'].map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => handleStyleChange(style)}
                className={`px-2.5 py-1 text-xxs font-mono rounded border transition-all ${
                  activeStyle === style
                    ? 'bg-blue-900 border-blue-900 text-white font-bold shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                }`}
              >
                {style.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-blue-900 hover:bg-blue-800 text-white font-medium font-sans rounded-md px-5 py-2.5 transition-colors duration-200 shadow-sm flex items-center justify-center gap-2 disabled:bg-slate-300 cursor-pointer text-sm shrink-0"
          >
            {loading ? (
              <>
                <Loader2 className="w-4 h-4 animate-spin text-white" />
                <span>Resolving...</span>
              </>
            ) : (
              <span>Generate Citation</span>
            )}
          </button>
        </div>
      </form>

      {error && (
        <div className="flex items-start gap-2.5 p-3 bg-red-50 border border-red-200 rounded-md text-xs text-red-700 font-sans leading-relaxed">
          <AlertCircle className="w-4 h-4 shrink-0 text-red-500 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {citation && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xs font-bold text-slate-500 font-sans uppercase tracking-wider">Formatted Entry ({activeStyle.toUpperCase()}):</span>
            <button
              onClick={handleCopy}
              className="text-xs font-medium text-slate-600 hover:text-blue-900 flex items-center gap-1 px-2 py-1 rounded bg-slate-100/50 hover:bg-slate-100 transition-colors cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-teal-600" />
                  <span className="text-teal-600">Copied</span>
                </>
              ) : (
                <>
                  <Clipboard className="w-3.5 h-3.5 text-slate-500" />
                  <span>Copy</span>
                </>
              )}
            </button>
          </div>
          
          <div className="bg-slate-50 border-l-4 border-blue-900 p-4 rounded-r-md font-mono text-sm text-slate-700 leading-relaxed break-words" id="generated-citation-box">
            {citation}
          </div>
        </div>
      )}
    </div>
  );
}
