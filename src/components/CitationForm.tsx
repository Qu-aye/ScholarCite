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
    <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 flex flex-col space-y-5 transition-all duration-300 hover:shadow-md" id="doi-citation-form">
      <div className="flex items-center gap-3">
        <div className="p-2 bg-indigo-50 rounded-xl text-indigo-600">
          <BookOpen className="w-5 h-5" />
        </div>
        <div>
          <h2 className="text-lg font-serif font-bold text-slate-900">DOI Deep Search</h2>
          <p className="text-xs text-slate-500 font-sans mt-0.5">Rapidly look up DOIs and format bibliographies via CrossRef registries</p>
        </div>
      </div>

      <form onSubmit={(e) => handleSubmit(e)} className="space-y-4">
        <div>
          <label htmlFor="doi" className="block text-xxs font-bold text-slate-400 font-sans uppercase tracking-wider mb-2">
            Digital Object Identifier (DOI)
          </label>
          <input
            type="text"
            id="doi"
            value={doi}
            onChange={(e) => setDoi(e.target.value)}
            className="w-full border border-transparent rounded-xl px-4 py-3.5 focus:ring-2 focus:ring-teal-500/80 focus:ring-offset-2 bg-slate-50 hover:bg-slate-100/50 focus:bg-white text-slate-800 outline-none transition-all duration-300 font-mono text-sm placeholder:font-sans placeholder:text-slate-400"
            placeholder="e.g., 10.1038/s41586-021-03491-6"
            required
          />
        </div>

        <div className="flex flex-col sm:flex-row items-stretch sm:items-center justify-between gap-4 pt-1">
          <div className="flex flex-wrap items-center gap-1.5">
            <span className="text-xxs font-bold text-slate-400 font-sans uppercase mr-1 whitespace-nowrap">Output Style:</span>
            {['apa', 'harvard', 'vancouver', 'chicago-author-date'].map((style) => (
              <button
                key={style}
                type="button"
                onClick={() => handleStyleChange(style)}
                className={`px-3 py-1.5 text-xxs font-mono rounded-lg border transition-all duration-300 cursor-pointer ${
                  activeStyle === style
                    ? 'bg-indigo-600 border-indigo-600 text-white font-semibold shadow-xs'
                    : 'bg-slate-50 border-slate-200 text-slate-600 hover:bg-slate-100/80 hover:text-slate-950'
                }`}
              >
                {style.toUpperCase()}
              </button>
            ))}
          </div>

          <button
            type="submit"
            disabled={loading}
            className="bg-indigo-600 hover:bg-indigo-700 text-white font-semibold font-sans rounded-xl px-5 py-2.5 transition-all duration-300 hover:scale-[1.01] active:scale-[0.99] shadow-sm flex items-center justify-center gap-2 disabled:bg-slate-200 disabled:text-slate-400 cursor-pointer text-xs shrink-0"
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
        <div className="flex items-start gap-2.5 p-3.5 bg-rose-50 border border-rose-200/50 rounded-xl text-xs text-rose-700 font-sans leading-relaxed">
          <AlertCircle className="w-4 h-4 shrink-0 text-rose-500 mt-0.5" />
          <span>{error}</span>
        </div>
      )}

      {citation && (
        <div className="mt-2 space-y-2">
          <div className="flex items-center justify-between">
            <span className="text-xxs font-bold text-slate-400 font-sans uppercase tracking-wider">Formatted Entry ({activeStyle.toUpperCase()}):</span>
            <button
              onClick={handleCopy}
              className="text-xs font-semibold text-indigo-600 hover:text-indigo-700 flex items-center gap-1.5 px-3 py-1.5 rounded-xl bg-indigo-50/50 hover:bg-indigo-50 transition-all cursor-pointer"
            >
              {copied ? (
                <>
                  <Check className="w-3.5 h-3.5 text-emerald-650" />
                  <span className="text-emerald-650">Copied</span>
                </>
              ) : (
                <>
                  <Clipboard className="w-3.5 h-3.5 text-indigo-500" />
                  <span>Copy Citation</span>
                </>
              )}
            </button>
          </div>
          
          <div className="bg-stone-50/60 border-l-4 border-indigo-600 p-5 rounded-r-xl font-serif font-medium text-sm text-slate-800 leading-relaxed break-words" id="generated-citation-box">
            {citation}
          </div>
        </div>
      )}
    </div>
  );
}
