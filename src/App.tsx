import React, { useState, useEffect } from 'react';
import DocumentUploader from './components/DocumentUploader';
import DocumentEditor from './components/DocumentEditor';
import CitationForm from './components/CitationForm';
import { 
  GraduationCap, 
  FileText, 
  BookOpen, 
  Sparkles, 
  LogIn, 
  LogOut, 
  Cloud, 
  CheckCircle2, 
  Trash2, 
  Edit2, 
  Plus, 
  Loader2, 
  User, 
  Settings, 
  RefreshCw, 
  Check, 
  X,
  PlusCircle,
  Clock,
  AlertCircle
} from 'lucide-react';
import { 
  auth, 
  db, 
  OperationType, 
  handleFirestoreError 
} from './services/firebase';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  onAuthStateChanged, 
  User as FirebaseUser 
} from 'firebase/auth';
import { 
  collection, 
  doc, 
  setDoc, 
  getDoc, 
  addDoc, 
  updateDoc, 
  deleteDoc, 
  onSnapshot, 
  serverTimestamp, 
  Timestamp 
} from 'firebase/firestore';
import { Source } from './services/searchService';

const ACADEMIC_TEMPLATE = `
  <h2>An Empirical Analysis of Modern Assistant Interfaces on Scholarly Writing</h2>
  <p>Academic literature compilation and citation management represent a high-entropy bottleneck in modern manuscript preparation. Researchers frequently experience significant cognitive overhead when switching context from writing drafts to looking up academic databases, validating DOI registries, and formatting bibliographical entries manually.</p>
  <p>To analyze the impact of inline assistive tooling, this study implements SewornaAI, an interactive workspace designed to identify published scientific publications and inject real-time bracket citations without leaving the immediate writing workspace. Highlighting any clinical claim or conceptual hypothesis in this active document panel triggers live intelligence lookup across indexed meta-registries.</p>
  <p>Subsequent testing demonstrates a substantial mitigation in task resumption latencies and context-switching fatigue. Direct reference composition in the text field enables instant Harvard, APA 7th Edition, MLA, and Chicago bibliography compilations.</p>
`;

interface FirestoreDraft {
  id: string;
  title: string;
  content: string;
  bibliography: Source[];
  citationStyle: 'harvard' | 'apa' | 'mla' | 'chicago';
  userId: string;
  createdAt: any;
  updatedAt: any;
}

export default function App() {
  // Document states
  const [documentContent, setDocumentContent] = useState<string>('');
  const [currentFileName, setCurrentFileName] = useState<string | null>(null);
  const [bibliography, setBibliography] = useState<Source[]>([]);
  const [citationStyle, setCitationStyle] = useState<'harvard' | 'apa' | 'mla' | 'chicago'>('harvard');
  const [activeTab, setActiveTab] = useState<'editor' | 'doi'>('editor');

  // Firebase auth & collection states
  const [user, setUser] = useState<FirebaseUser | null>(null);
  const [authLoading, setAuthLoading] = useState<boolean>(true);
  const [authError, setAuthError] = useState<string | null>(null);
  const [drafts, setDrafts] = useState<FirestoreDraft[]>([]);
  const [draftsLoading, setDraftsLoading] = useState<boolean>(false);
  const [activeDraftId, setActiveDraftId] = useState<string | null>(null);
  const [activeDraftCreatedAt, setActiveDraftCreatedAt] = useState<any>(null);

  // Live Saving States
  const [syncStatus, setSyncStatus] = useState<'saved' | 'saving' | 'local' | 'error'>('local');
  const [syncMessage, setSyncMessage] = useState<string>('Unsaved local workspace draft');

  // UI interaction states
  const [isCreatingDraft, setIsCreatingDraft] = useState<boolean>(false);
  const [isDeletingDraftId, setIsDeletingDraftId] = useState<string | null>(null);
  const [renamingDraftId, setRenamingDraftId] = useState<string | null>(null);
  const [renamingTitle, setRenamingTitle] = useState<string>('');

  // Handle load default academic template
  const handleLoadSample = () => {
    setDocumentContent(ACADEMIC_TEMPLATE);
    setCurrentFileName('academic_sample_draft.docx');
    setBibliography([]);
    setCitationStyle('harvard');
    setActiveDraftId(null);
    setActiveDraftCreatedAt(null);
    setSyncStatus('local');
    setSyncMessage('Unsaved local sample draft version');
  };

  // Google Authentication Trigger
  const handleGoogleSignIn = async () => {
    const provider = new GoogleAuthProvider();
    setAuthError(null);
    try {
      const result = await signInWithPopup(auth, provider);
      const signedInUser = result.user;
      
      // Save profile metadata on first log
      const userRef = doc(db, 'users', signedInUser.uid);
      const userSnap = await getDoc(userRef);
      if (!userSnap.exists()) {
        await setDoc(userRef, {
          uid: signedInUser.uid,
          email: signedInUser.email,
          displayName: signedInUser.displayName || 'Authorized Scholar',
          photoURL: signedInUser.photoURL || '',
          createdAt: serverTimestamp()
        });
      }
    } catch (error: any) {
      console.error('Google Sign-In Error:', error);
      if (error?.code === 'auth/popup-closed-by-user' || error?.message?.includes('popup-closed-by-user')) {
        setAuthError('Sign-in window closed before completion. Please try connecting your Google account again.');
      } else {
        setAuthError(error?.message || 'Academic sign-in verification failed. Please try again.');
      }
    }
  };

  const handleSignOut = async () => {
    try {
      await signOut(auth);
      // Clear active paper draft identifiers
      setActiveDraftId(null);
      setActiveDraftCreatedAt(null);
      setDrafts([]);
    } catch (error) {
      console.error('Sign-Out Error:', error);
    }
  };

  // Listen to Auth State Changes
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      setUser(currentUser);
      setAuthLoading(false);
      if (currentUser) {
        setAuthError(null);
      }
    });
    return () => unsubscribe();
  }, []);

  // Listen to active user's documents real-time list
  useEffect(() => {
    if (!user) {
      setDrafts([]);
      return;
    }

    setDraftsLoading(true);
    const draftsColRef = collection(db, 'users', user.uid, 'drafts');
    
    const unsubscribe = onSnapshot(draftsColRef, (snapshot) => {
      const list: FirestoreDraft[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data();
        list.push({
          id: doc.id,
          ...data
        } as FirestoreDraft);
      });
      // Sort drafts by updatedAt timestamp descending
      list.sort((a, b) => {
        const tA = a.updatedAt?.toMillis ? a.updatedAt.toMillis() : 0;
        const tB = b.updatedAt?.toMillis ? b.updatedAt.toMillis() : 0;
        return tB - tA;
      });
      setDrafts(list);
      setDraftsLoading(false);
    }, (error) => {
      setDraftsLoading(false);
      handleFirestoreError(error, OperationType.LIST, `users/${user.uid}/drafts`);
    });

    return () => unsubscribe();
  }, [user]);

  // Reactive Debounced Autosave Under User Space
  useEffect(() => {
    if (!user || !activeDraftId) {
      setSyncStatus('local');
      setSyncMessage('Changes saved to temporary browser memory');
      return;
    }

    setSyncStatus('saving');
    setSyncMessage('Saving changes to cloud backup...');

    const delayDebounceFn = setTimeout(async () => {
      try {
        const draftDocRef = doc(db, 'users', user.uid, 'drafts', activeDraftId);
        await updateDoc(draftDocRef, {
          title: currentFileName || 'Untitled Paper.docx',
          content: documentContent,
          bibliography: bibliography,
          citationStyle: citationStyle,
          userId: user.uid,
          createdAt: activeDraftCreatedAt || serverTimestamp(),
          updatedAt: serverTimestamp()
        });
        setSyncStatus('saved');
        setSyncMessage('Real-time workspace backed up to Cloud');
      } catch (err) {
        console.error('Core autosave error:', err);
        setSyncStatus('error');
        setSyncMessage('Synchronization delayed. Checking workspace...');
      }
    }, 1500); // 1.5 seconds typing debounce

    return () => clearTimeout(delayDebounceFn);
  }, [documentContent, currentFileName, bibliography, citationStyle, activeDraftId, user]);

  // Create standard template or empty document directly in cloud
  const handleCreateNewCloudDraft = async (title: string = 'Untitled Research Paper.docx') => {
    if (!user) return;
    try {
      setIsCreatingDraft(true);
      const draftsCol = collection(db, 'users', user.uid, 'drafts');
      
      const newDocRef = await addDoc(draftsCol, {
        title,
        content: '',
        bibliography: [],
        citationStyle: 'harvard',
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      // Update local context
      setActiveDraftId(newDocRef.id);
      setActiveDraftCreatedAt(Timestamp.now());
      setDocumentContent('');
      setCurrentFileName(title);
      setBibliography([]);
      setCitationStyle('harvard');
    } catch (err) {
      console.error('Could not create new synced draft:', err);
    } finally {
      setIsCreatingDraft(false);
    }
  };

  // Convert currently loaded file / edit stream into a cloud workspace draft
  const handleSaveWorkspaceToCloud = async () => {
    if (!user) return;
    try {
      setIsCreatingDraft(true);
      const draftsCol = collection(db, 'users', user.uid, 'drafts');
      
      const title = currentFileName || 'Imported Scholar Draft.docx';
      const newDocRef = await addDoc(draftsCol, {
        title,
        content: documentContent,
        bibliography: bibliography,
        citationStyle: citationStyle,
        userId: user.uid,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });

      setActiveDraftId(newDocRef.id);
      setActiveDraftCreatedAt(Timestamp.now());
      setSyncStatus('saved');
    } catch (err) {
      console.error('Error saving workspace to cloud:', err);
    } finally {
      setIsCreatingDraft(false);
    }
  };

  const handleLoadDraft = (draft: FirestoreDraft) => {
    setActiveDraftId(draft.id);
    setActiveDraftCreatedAt(draft.createdAt);
    setDocumentContent(draft.content || '');
    setCurrentFileName(draft.title || 'Untitled Draft.docx');
    setBibliography(draft.bibliography || []);
    setCitationStyle(draft.citationStyle || 'harvard');
    setSyncStatus('saved');
    setSyncMessage('Workspace loaded successfully');
  };

  const handleDeleteDraft = async (draftId: string, e: React.MouseEvent) => {
    e.stopPropagation();
    if (!user) return;
    if (!window.confirm('Are you sure you want to permanently delete this cloud writing workspace? This cannot be recovered.')) {
      return;
    }

    try {
      // If current document is the one being deleted, unload first
      if (activeDraftId === draftId) {
        setActiveDraftId(null);
        setActiveDraftCreatedAt(null);
        setDocumentContent('');
        setCurrentFileName(null);
        setBibliography([]);
        setSyncStatus('local');
      }

      setIsDeletingDraftId(draftId);
      const draftDocRef = doc(db, 'users', user.uid, 'drafts', draftId);
      await deleteDoc(draftDocRef);
    } catch (error) {
      console.error('Delete workspace error:', error);
      handleFirestoreError(error, OperationType.DELETE, `users/${user.uid}/drafts/${draftId}`);
    } finally {
      setIsDeletingDraftId(null);
    }
  };

  const startRenameDraft = (draft: FirestoreDraft, e: React.MouseEvent) => {
    e.stopPropagation();
    setRenamingDraftId(draft.id);
    setRenamingTitle(draft.title);
  };

  const submitRenameDraft = async (draftId: string) => {
    if (!user || !renamingTitle.trim()) {
      setRenamingDraftId(null);
      return;
    }

    try {
      const draftDocRef = doc(db, 'users', user.uid, 'drafts', draftId);
      const d = drafts.find(it => it.id === draftId);
      
      await updateDoc(draftDocRef, {
        title: renamingTitle.trim(),
        updatedAt: serverTimestamp()
      });

      if (activeDraftId === draftId) {
        setCurrentFileName(renamingTitle.trim());
      }
    } catch (error) {
      console.error('Rename error:', error);
    } finally {
      setRenamingDraftId(null);
    }
  };

  return (
    <div className="min-h-screen bg-slate-50 text-slate-800 font-sans selection:bg-teal-100 selection:text-teal-900 pb-16">
      {/* Editorial Header / Professional Academic Masthead */}
      <header className="border-b border-slate-200 bg-white shadow-xs">
        <div className="max-w-6xl mx-auto px-4 py-6 sm:py-8 flex flex-col md:flex-row items-center justify-between gap-6">
          <div className="flex flex-col sm:flex-row items-center gap-4 text-center sm:text-left">
            <div className="w-12 h-12 bg-blue-900 rounded-lg flex items-center justify-center text-white shadow-sm border border-blue-950">
              <GraduationCap className="w-7 h-7" />
            </div>
            <div>
              <h1 className="text-3xl font-serif font-bold text-slate-900 tracking-tight flex items-center justify-center sm:justify-start gap-2.5">
                SewornaAI
                <span className="text-xxs font-mono translate-y-0.5 bg-blue-50 text-blue-950 px-2 py-0.5 rounded-full border border-blue-100 uppercase tracking-wider">
                  Cloud Live
                </span>
              </h1>
              <p className="text-xs text-slate-500 font-sans mt-0.5 leading-relaxed">
                An authoritative research assistant that matches claims to academic publications and generates real-time citations.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Functional Toggle Tabs */}
            <div className="flex bg-slate-100 p-1 rounded-lg border border-slate-200">
              <button
                onClick={() => setActiveTab('editor')}
                className={`flex items-center justify-center gap-2 py-1.5 px-4 rounded-md text-xs font-semibold font-sans transition-all cursor-pointer ${
                  activeTab === 'editor'
                    ? 'bg-blue-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Workspace
              </button>
              <button
                onClick={() => setActiveTab('doi')}
                className={`flex items-center justify-center gap-2 py-1.5 px-4 rounded-md text-xs font-semibold font-sans transition-all cursor-pointer ${
                  activeTab === 'doi'
                    ? 'bg-blue-900 text-white shadow-xs'
                    : 'text-slate-600 hover:text-slate-900 hover:bg-slate-50/50'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                DOI Rapid Lookup
              </button>
            </div>

            {/* Premium Google Auth Button */}
            {authLoading ? (
              <div className="flex items-center text-xs text-slate-400 gap-1.5 px-3 py-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
                <span>Checking profile...</span>
              </div>
            ) : user ? (
              <div className="flex items-center gap-3 bg-slate-100 pl-3 pr-1 py-1 rounded-full border border-slate-200 shadow-xxs">
                <div className="hidden sm:block text-right">
                  <p className="text-xxs font-bold text-slate-800 leading-none">{user.displayName || 'Authorized Scholar'}</p>
                  <p className="text-xxs text-slate-400 leading-none mt-0.5 max-w-[120px] truncate">{user.email}</p>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Scholar Avatar" className="w-7 h-7 rounded-full border border-white" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-full bg-blue-900 text-white flex items-center justify-center text-xs font-bold">
                    {user.displayName?.[0] || 'U'}
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  title="Sign out from workspace"
                  className="p-1.5 text-slate-500 hover:text-red-600 rounded-full hover:bg-slate-250 transition-colors cursor-pointer"
                >
                  <LogOut className="w-4 h-4" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="flex items-center gap-2 bg-blue-900 shadow-sm border border-blue-950 text-white hover:bg-blue-800 font-sans font-semibold text-xs px-4 py-2 rounded-lg transition-all hover:scale-103 cursor-pointer"
              >
                <LogIn className="w-4 h-4" />
                Sign in with Google
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="max-w-6xl mx-auto px-4 my-8">
        {authError && (
          <div className="mb-6 p-4 bg-amber-50 border border-amber-200 text-amber-900 rounded-lg flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-center gap-3">
              <AlertCircle className="w-5 h-5 text-amber-600 shrink-0" />
              <p className="text-xs font-semibold leading-relaxed font-sans">{authError}</p>
            </div>
            <button
              onClick={() => setAuthError(null)}
              className="p-1 text-amber-600 hover:text-amber-950 rounded hover:bg-amber-100 transition-colors cursor-pointer"
              title="Dismiss integration alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {activeTab === 'editor' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-200">
            
            {/* LEFT COLUMN: Workspace Draft Manager Panel (3 / 12 width) */}
            <section className="lg:col-span-4 flex flex-col gap-6">
              
              {/* Cloud Storage integration overview widget */}
              <div className="bg-white border border-slate-200 rounded-lg p-5 shadow-sm space-y-4">
                <div className="flex items-center justify-between border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2">
                    <Cloud className={`w-5 h-5 ${user ? 'text-teal-600' : 'text-slate-400'}`} />
                    <h2 className="text-sm font-serif font-bold text-slate-800">Cloud Storage backup</h2>
                  </div>

                  {user && (
                    <button
                      onClick={() => handleCreateNewCloudDraft()}
                      disabled={isCreatingDraft}
                      className="text-xxs font-medium font-sans text-blue-900 hover:text-blue-800 flex items-center gap-1 bg-blue-50 border border-blue-100 px-2 py-1 rounded hover:bg-blue-100 cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      Add Workspace
                    </button>
                  )}
                </div>

                {/* Integration states */}
                {!user ? (
                  <div className="bg-slate-50 border border-slate-200 rounded-lg p-4 space-y-3 text-center">
                    <p className="text-xs text-slate-600 font-sans leading-relaxed">
                      Connect your academic identity to enable continuous real-time cloud backup, manage multiple papers, and preserve inline bibliographies.
                    </p>
                    <button
                      onClick={handleGoogleSignIn}
                      className="w-full flex items-center justify-center gap-2 bg-white hover:bg-slate-50 border border-slate-300 text-slate-800 font-semibold text-xs py-2 rounded-md shadow-xxs transition-colors cursor-pointer"
                    >
                      <LogIn className="w-3.5 h-3.5 text-blue-900" />
                      Connect Google Account
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Drafts List Catalog */}
                    {draftsLoading ? (
                      <div className="flex flex-col items-center py-6 text-slate-400 gap-2">
                        <Loader2 className="w-6 h-6 animate-spin text-blue-900" />
                        <span className="text-xxs font-mono">Syncing workspace drafts...</span>
                      </div>
                    ) : drafts.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-slate-200 bg-slate-50 rounded-lg space-y-1.5 p-3">
                        <FileText className="w-6 h-6 text-slate-400 mx-auto" />
                        <p className="text-xs font-semibold text-slate-700">No backup workspaces yet</p>
                        <p className="text-xxs text-slate-500 leading-relaxed max-w-[190px] mx-auto">
                          Click above or write below then save your active draft to the cloud.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2 max-h-[290px] overflow-y-auto pr-1">
                        {drafts.map((draft) => (
                          <div 
                            key={draft.id}
                            onClick={() => handleLoadDraft(draft)}
                            className={`group flex items-center justify-between p-3 rounded-lg border text-left transition-all cursor-pointer ${
                              activeDraftId === draft.id 
                                ? 'bg-blue-50/50 border-blue-900 shadow-xxs ring-1 ring-blue-100' 
                                : 'bg-slate-50 hover:bg-slate-100/70 border-slate-200 hover:border-slate-350'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${activeDraftId === draft.id ? 'text-blue-900' : 'text-slate-400'}`} />
                              <div className="min-w-0 flex-1">
                                {renamingDraftId === draft.id ? (
                                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                      type="text" 
                                      value={renamingTitle}
                                      onChange={(e) => setRenamingTitle(e.target.value)}
                                      className="text-xs border border-blue-900 rounded bg-white px-2 py-0.5 w-full focus:outline-none focus:ring-1 focus:ring-blue-100"
                                      autoFocus
                                    />
                                    <button 
                                      onClick={() => submitRenameDraft(draft.id)}
                                      className="p-1 text-teal-600 hover:bg-teal-50 rounded"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => setRenamingDraftId(null)}
                                      className="p-1 text-red-650 hover:bg-red-50 rounded"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-xs font-semibold text-slate-800 truncate" title={draft.title}>
                                      {draft.title || 'Untitled Draft'}
                                    </p>
                                    <div className="flex items-center gap-1.5 text-xxs text-slate-400 mt-0.5">
                                      <span className="truncate">{draft.bibliography?.length || 0} citations</span>
                                      <span>&bull;</span>
                                      <span className="truncate flex items-center gap-0.5">
                                        <Clock className="w-2.5 h-2.5 shrink-0" />
                                        {draft.updatedAt ? new Date(draft.updatedAt.toMillis()).toLocaleDateString() : 'Just now'}
                                      </span>
                                    </div>
                                  </>
                                )}
                              </div>
                            </div>

                            {/* Options Column */}
                            {renamingDraftId !== draft.id && (
                              <div className="flex items-center gap-1 opacity-10 md:opacity-0 group-hover:opacity-100 transition-opacity ml-2" onClick={(e) => e.stopPropagation()}>
                                <button 
                                  onClick={(e) => startRenameDraft(draft, e)}
                                  className="p-1 hover:bg-slate-200 text-slate-500 rounded"
                                  title="Rename workspace"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={(e) => handleDeleteDraft(draft.id, e)}
                                  disabled={isDeletingDraftId === draft.id}
                                  className="p-1 hover:bg-red-50 text-red-600 rounded disabled:opacity-50"
                                  title="Delete paper"
                                >
                                  <Trash2 className="w-3 h-3" />
                                </button>
                              </div>
                            )}
                          </div>
                        ))}
                      </div>
                    )}
                  </div>
                )}

                {/* Non-synced workspace promotion banner */}
                {user && !activeDraftId && (
                  <div className="bg-slate-50 border-l-4 border-blue-900 rounded-r-md p-4 space-y-2 mt-4">
                    <p className="text-xs font-semibold text-slate-700">Unsynchronized Project Workspace</p>
                    <p className="text-xxs text-slate-500 leading-normal">
                      You are currently drafting offline. Convert this project to a Cloud Workspace to keep changes synchronized.
                    </p>
                    <button
                      onClick={handleSaveWorkspaceToCloud}
                      disabled={isCreatingDraft}
                      className="w-full flex items-center justify-center gap-1.5 bg-blue-900 hover:bg-blue-800 text-white font-semibold text-xs py-1.5 px-3 rounded shadow-xxs transition-colors cursor-pointer"
                    >
                      {isCreatingDraft ? (
                        <Loader2 className="w-3 h-3 animate-spin" />
                      ) : (
                        <PlusCircle className="w-3.5 h-3.5" />
                      )}
                      Sync current file as Cloud Workspace
                    </button>
                  </div>
                )}
              </div>

              {/* Upload Word Document / prefilled draft template section */}
              <DocumentUploader 
                onDocumentLoaded={(content) => {
                  setDocumentContent(content);
                  // Preserve Active Draft to sync parsed docx text directly if linked
                  if (!activeDraftId) {
                    setSyncStatus('local');
                  }
                }} 
                currentFileName={currentFileName}
                setCurrentFileName={setCurrentFileName}
                onLoadSample={handleLoadSample}
              />
            </section>

            {/* RIGHT COLUMN: Interactive Document Editor Canvas (8 / 12 width) */}
            <section className="lg:col-span-8 flex flex-col gap-6">
              
              {/* Status Alert Ribbon representing Real-time Cloud Save */}
              <div className="flex items-center justify-between px-5 py-3.5 bg-white border border-slate-200 rounded-lg shadow-xxs">
                <div className="flex items-center gap-2.5">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    syncStatus === 'saved' 
                      ? 'bg-emerald-500 animate-pulse' 
                      : syncStatus === 'saving' 
                      ? 'bg-amber-500 animate-pulse' 
                      : 'bg-slate-400'
                  }`} />
                  <div className="space-y-0.5">
                    <p className="text-xs font-semibold text-slate-800">{syncMessage}</p>
                    <p className="text-xxs font-mono text-slate-400 uppercase tracking-wider">
                      {activeDraftId ? `Workspace ID: ${activeDraftId}` : 'Standalone memory mode'}
                    </p>
                  </div>
                </div>
                
                {activeDraftId && (
                  <span className="text-xxs font-mono text-teal-600 bg-teal-50 px-2 py-0.5 rounded border border-teal-100">
                    Live Synced
                  </span>
                )}
              </div>

              {/* Central Editor Canvas Layout Panel */}
              <div className="bg-white rounded-lg shadow-sm border border-slate-200 p-6">
                <div className="mb-4 pb-3 border-b border-slate-100 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-blue-900" />
                    <span className="text-xs font-bold text-slate-500 font-sans uppercase tracking-wider">
                      Interactive Workspace
                    </span>
                  </div>
                  {currentFileName && (
                    <span className="text-xxs font-mono text-slate-400 bg-slate-50 px-2.5 py-0.5 rounded border border-slate-100">
                      Markdown & Draft Parsing Ready
                    </span>
                  )}
                </div>
                
                <DocumentEditor 
                  content={documentContent} 
                  onContentChange={(html) => setDocumentContent(html)}
                  bibliography={bibliography}
                  onBibliographyChange={(updatedBib) => setBibliography(updatedBib)}
                  citationStyle={citationStyle}
                  onCitationStyleChange={(style) => setCitationStyle(style)}
                />
              </div>

            </section>
          </div>
        ) : (
          <div className="animate-in fade-in duration-200">
            {/* Standalone DOI Lookup Tool Tab */}
            <CitationForm />
          </div>
        )}
      </main>

      {/* Structured Page Footer */}
      <footer className="max-w-6xl mx-auto px-4 mt-12 py-6 border-t border-slate-200 text-center flex flex-col sm:flex-row items-center justify-between gap-4">
        <p className="text-xxs font-mono text-slate-400 uppercase tracking-widest">
          SewornaAI Academic Indexing Platform &bull; Powered by Gemini AI
        </p>
        <p className="text-xxs font-mono text-slate-400 uppercase tracking-widest">
          Secured with Firestore Fortress security rules
        </p>
      </footer>
    </div>
  );
}
