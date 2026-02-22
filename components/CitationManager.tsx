import React, { useState } from 'react';
import { Source } from '../types';
import { BookMarked, Plus, Trash2, Quote, X, Save, Search, PenTool, Link as LinkIcon, Calendar, User, BookOpen } from 'lucide-react';

interface CitationManagerProps {
  isOpen: boolean;
  onClose: () => void;
  library: Source[];
  onCite: (source: Source) => void;
  onDelete: (id: string) => void;
  onAdd: (source: Source) => void;
  isFormatting: boolean;
}

const EmptyLibraryState = () => (
  <div className="flex flex-col items-center justify-center h-64 text-gray-400 text-center p-6">
    <div className="bg-gray-100 p-4 rounded-full mb-4">
      <BookMarked className="w-8 h-8 text-gray-300" />
    </div>
    <h3 className="text-lg font-medium text-gray-900 mb-1">Your library is empty</h3>
    <p className="max-w-xs text-sm">
      Save sources from search results or add them manually to organize your references here.
    </p>
  </div>
);

const ManualEntryForm: React.FC<{ onSave: (s: Source) => void; onCancel: () => void }> = ({ onSave, onCancel }) => {
  const [formData, setFormData] = useState({
    title: '',
    author: '',
    year: new Date().getFullYear().toString(),
    publication: '',
    url: '',
    snippet: ''
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    onSave({
      ...formData,
      id: crypto.randomUUID(),
      dateAdded: new Date().toISOString()
    });
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-4 p-1">
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Title</label>
        <input 
          required 
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="e.g. The Impact of Climate Change"
          value={formData.title}
          onChange={e => setFormData({...formData, title: e.target.value})}
        />
      </div>
      <div className="grid grid-cols-2 gap-4">
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Author(s)</label>
          <input 
            required 
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="e.g. Smith, J. and Doe, A."
            value={formData.author}
            onChange={e => setFormData({...formData, author: e.target.value})}
          />
        </div>
        <div>
          <label className="block text-xs font-medium text-gray-700 mb-1">Year</label>
          <input 
            required 
            className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
            placeholder="e.g. 2023"
            value={formData.year}
            onChange={e => setFormData({...formData, year: e.target.value})}
          />
        </div>
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Publication / Publisher</label>
        <input 
          required 
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="e.g. Nature Journal"
          value={formData.publication}
          onChange={e => setFormData({...formData, publication: e.target.value})}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">URL (Exact link required)</label>
        <input 
          required 
          type="url"
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="https://..."
          value={formData.url}
          onChange={e => setFormData({...formData, url: e.target.value})}
        />
      </div>
      <div>
        <label className="block text-xs font-medium text-gray-700 mb-1">Notes (Optional)</label>
        <textarea 
          className="w-full border border-gray-300 rounded-md px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 outline-none"
          placeholder="Add personal notes or a summary..."
          rows={2}
          value={formData.snippet}
          onChange={e => setFormData({...formData, snippet: e.target.value})}
        />
      </div>
      <div className="flex justify-end gap-2 pt-2">
        <button 
          type="button" 
          onClick={onCancel}
          className="px-4 py-2 text-sm text-gray-600 hover:bg-gray-100 rounded-md"
        >
          Cancel
        </button>
        <button 
          type="submit" 
          className="px-4 py-2 text-sm bg-blue-600 text-white rounded-md hover:bg-blue-700 flex items-center gap-2"
        >
          <Save className="w-4 h-4" /> Save Source
        </button>
      </div>
    </form>
  );
};

const CitationManager: React.FC<CitationManagerProps> = ({
  isOpen,
  onClose,
  library,
  onCite,
  onDelete,
  onAdd,
  isFormatting
}) => {
  const [view, setView] = useState<'list' | 'add'>('list');

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50 backdrop-blur-sm p-4">
      <div className="bg-white rounded-xl shadow-2xl w-full max-w-2xl max-h-[85vh] flex flex-col overflow-hidden animate-in fade-in zoom-in duration-200">
        
        {/* Header */}
        <div className="p-5 border-b border-gray-100 bg-gray-50 flex justify-between items-center">
          <div className="flex items-center gap-3">
            <div className="bg-white p-2 rounded-lg shadow-sm border border-gray-200">
              <BookMarked className="w-5 h-5 text-blue-600" />
            </div>
            <div>
              <h2 className="text-lg font-serif font-bold text-gray-900">Citation Library</h2>
              <p className="text-xs text-gray-500">{library.length} saved sources</p>
            </div>
          </div>
          <button onClick={onClose} className="text-gray-400 hover:text-gray-600">
            <X className="w-6 h-6" />
          </button>
        </div>

        {/* Toolbar */}
        {view === 'list' && (
           <div className="px-5 py-3 border-b border-gray-100 flex justify-between items-center bg-white">
             <div className="relative w-full max-w-xs hidden sm:block">
               <Search className="w-4 h-4 absolute left-3 top-1/2 -translate-y-1/2 text-gray-400" />
               <input 
                 placeholder="Filter sources..." 
                 className="w-full pl-9 pr-4 py-1.5 text-sm border border-gray-200 rounded-md focus:outline-none focus:border-blue-400 transition-colors"
               />
             </div>
             <button 
                onClick={() => setView('add')}
                className="flex items-center gap-2 text-sm font-medium text-blue-600 hover:bg-blue-50 px-3 py-1.5 rounded-md transition-colors ml-auto"
              >
                <Plus className="w-4 h-4" /> Add Manual Source
             </button>
           </div>
        )}

        {view === 'add' && (
           <div className="px-5 py-3 border-b border-gray-100 flex items-center gap-2 bg-white">
             <button onClick={() => setView('list')} className="text-sm text-gray-500 hover:text-gray-900">
                &larr; Back to Library
             </button>
             <h3 className="text-sm font-bold text-gray-900 ml-2">Add New Source</h3>
           </div>
        )}

        {/* Content */}
        <div className="flex-1 overflow-y-auto p-5 bg-gray-50">
          
          {view === 'add' ? (
            <ManualEntryForm 
              onSave={(source) => {
                onAdd(source);
                setView('list');
              }}
              onCancel={() => setView('list')}
            />
          ) : (
            <>
              {library.length === 0 ? (
                <EmptyLibraryState />
              ) : (
                <div className="space-y-4">
                  {library.map((source) => (
                    <div key={source.id} className="bg-white border border-gray-200 rounded-lg p-4 hover:shadow-md transition-shadow group relative">
                       <div className="flex justify-between items-start mb-2">
                         <h3 className="font-semibold text-gray-900 pr-8 line-clamp-1">{source.title}</h3>
                         <button 
                           onClick={() => source.id && onDelete(source.id)}
                           className="text-gray-300 hover:text-red-500 transition-colors absolute top-4 right-4"
                           title="Remove from library"
                         >
                           <Trash2 className="w-4 h-4" />
                         </button>
                       </div>
                       
                       <div className="flex flex-wrap gap-2 text-xs text-gray-500 mb-3">
                          <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                            <User className="w-3 h-3" /> {source.author}
                          </span>
                          <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-100">
                            <Calendar className="w-3 h-3" /> {source.year}
                          </span>
                          <span className="flex items-center gap-1 bg-gray-50 px-2 py-1 rounded border border-gray-100 italic">
                            <BookOpen className="w-3 h-3" /> {source.publication}
                          </span>
                        </div>

                        {source.snippet && (
                          <p className="text-xs text-gray-500 mb-3 line-clamp-2 italic bg-yellow-50/50 p-2 rounded">
                            {source.snippet}
                          </p>
                        )}
                       
                       <div className="flex items-center justify-between pt-3 border-t border-gray-50 mt-1">
                          <a href={source.url} target="_blank" rel="noreferrer" className="text-xs text-blue-500 hover:underline flex items-center gap-1">
                            <LinkIcon className="w-3 h-3" /> View Source
                          </a>
                          <button 
                            onClick={() => onCite(source)}
                            disabled={isFormatting}
                            className="bg-gray-900 text-white text-xs px-3 py-1.5 rounded-md hover:bg-black transition-colors flex items-center gap-2 shadow-sm"
                          >
                             {isFormatting ? (
                               <span className="animate-spin">⌛</span>
                             ) : (
                               <Quote className="w-3 h-3" />
                             )}
                             Cite in Doc
                          </button>
                       </div>
                    </div>
                  ))}
                </div>
              )}
            </>
          )}
        </div>
      </div>
    </div>
  );
};

export default CitationManager;
