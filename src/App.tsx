import React, { useState, useEffect } from 'react';
import DocumentUploader from './components/DocumentUploader';
import DocumentEditor from './components/DocumentEditor';
import CitationForm from './components/CitationForm';
// @ts-ignore
import html2pdf from 'html2pdf.js';
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
  AlertCircle,
  Download,
  Copy,
  FileDown
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

// Helper functions for generating bibliography files in standard academic formats
function generateBibTeXKey(source: Source, index: number): string {
  if (!source.author) return `ref_${index + 1}`;
  const firstAuthor = source.author.split(';')[0].split(',')[0].trim();
  const lastName = firstAuthor.split(/\s+/).pop() || 'ref';
  const cleanName = lastName.toLowerCase().replace(/[^a-z0-9]/g, '');
  const year = source.year ? source.year.trim() : 'year';
  return `${cleanName}${year}_${index + 1}`;
}

function convertToBibTeX(sources: Source[]): string {
  return sources.map((source, index) => {
    const key = generateBibTeXKey(source, index);
    let authors = source.author || 'Unknown Author';
    authors = authors.replace(/;/g, ' and ').replace(/,/g, ' and ');
    authors = authors.replace(/\s+/g, ' ').trim();

    let entry = `@article{${key},\n`;
    entry += `  author  = {${authors}},\n`;
    entry += `  title   = {${source.title || 'Untitled Work'}},\n`;
    entry += `  year    = {${source.year || 'n.d.'}},\n`;
    if (source.doi) {
      entry += `  doi     = {${source.doi}},\n`;
      entry += `  url     = {https://doi.org/${source.doi}}\n`;
    } else {
      entry += `  note    = {Retrieved from SewornaAI Platform}\n`;
    }
    entry += `}`;
    return entry;
  }).join('\n\n');
}

function convertToRIS(sources: Source[]): string {
  return sources.map((source) => {
    let ris = `TY  - JOUR\n`;
    ris += `TI  - ${source.title || 'Untitled Work'}\n`;
    const authors = (source.author || 'Unknown Author')
      .split(/;|\band\b|,/)
      .map(a => a.trim())
      .filter(Boolean);
    
    authors.forEach(auth => {
      ris += `AU  - ${auth}\n`;
    });
    ris += `PY  - ${source.year || 'n.d.'}\n`;
    if (source.doi) {
      ris += `DO  - ${source.doi}\n`;
      ris += `UR  - https://doi.org/${source.doi}\n`;
    }
    ris += `ER  - \n`;
    return ris;
  }).join('\n');
}

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
  const [copiedFormat, setCopiedFormat] = useState<'bibtex' | 'ris' | null>(null);

  // Bibliography copy and download event handlers
  const handleCopyBibliography = (format: 'bibtex' | 'ris') => {
    const text = format === 'bibtex' ? convertToBibTeX(bibliography) : convertToRIS(bibliography);
    navigator.clipboard.writeText(text).then(() => {
      setCopiedFormat(format);
      setTimeout(() => setCopiedFormat(null), 2000);
    }).catch((err) => {
      console.error('Failed to copy bibliography: ', err);
    });
  };

  const handleDownloadBibliography = (format: 'bibtex' | 'ris') => {
    const content = format === 'bibtex' ? convertToBibTeX(bibliography) : convertToRIS(bibliography);
    const blob = new Blob([content], { type: 'text/plain;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    
    const docTitle = currentFileName 
      ? currentFileName.replace(/\.[^/.]+$/, "") 
      : (activeDraftId ? drafts.find(d => d.id === activeDraftId)?.title : 'scholarcite_bibliography');
    const safeTitle = (docTitle || 'scholarcite_bibliography')
      .toLowerCase()
      .replace(/[^a-z0-9_-]/g, '_');
      
    link.download = `${safeTitle}.${format === 'bibtex' ? 'bib' : 'ris'}`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const [isExportingPDF, setIsExportingPDF] = useState<boolean>(false);
  const [isExportingDocx, setIsExportingDocx] = useState<boolean>(false);

  // Convert HTML to simple, clean Markdown structure
  const handleDownloadMarkdown = () => {
    let markdown = documentContent || '';
    
    // Header conversions
    markdown = markdown.replace(/<h1>(.*?)<\/h1>/gi, '# $1\n\n');
    markdown = markdown.replace(/<h2>(.*?)<\/h2>/gi, '## $1\n\n');
    markdown = markdown.replace(/<h3>(.*?)<\/h3>/gi, '### $1\n\n');
    
    // Standard block formatting
    markdown = markdown.replace(/<p>(.*?)<\/p>/gi, '$1\n\n');
    markdown = markdown.replace(/<strong>(.*?)<\/strong>/gi, '**$1**');
    markdown = markdown.replace(/<b>(.*?)<\/b>/gi, '**$1**');
    markdown = markdown.replace(/<em>(.*?)<\/em>/gi, '*$1*');
    markdown = markdown.replace(/<i>(.*?)<\/i>/gi, '*$1*');
    
    // Lists & formatting
    markdown = markdown.replace(/<li>(.*?)<\/li>/gi, '- $1\n');
    markdown = markdown.replace(/<ul>/gi, '');
    markdown = markdown.replace(/<\/ul>/gi, '\n');
    markdown = markdown.replace(/<ol>/gi, '');
    markdown = markdown.replace(/<\/ol>/gi, '\n');
    markdown = markdown.replace(/<a href="(.*?)".*?>(.*?)<\/a>/gi, '[$2]($1)');
    markdown = markdown.replace(/<br\s*\/?>/gi, '\n');
    
    // Strip other unwanted HTML wrappers
    markdown = markdown.replace(/<[^>]+>/g, '');
    
    markdown = markdown
      .replace(/&nbsp;/g, ' ')
      .replace(/&amp;/g, '&')
      .replace(/&lt;/g, '<')
      .replace(/&gt;/g, '>');

    let docTitle = currentFileName 
      ? currentFileName.replace(/\.[^/.]+$/, "") 
      : (activeDraftId ? drafts.find(d => d.id === activeDraftId)?.title : 'scholarcite_manuscript');
    let safeTitle = (docTitle || 'scholarcite_manuscript')
      .replace(/\.[^/.]+$/, "");

    let finalMarkdown = `# ${safeTitle}\n\n${markdown.trim()}\n\n`;

    // Append bibliography if it contains references
    if (bibliography && bibliography.length > 0) {
      finalMarkdown += `## References\n\n`;
      bibliography.forEach((source, index) => {
        const citationData = source?.citations?.[citationStyle];
        const fullReference = citationData?.full || `${source.author} (${source.year}). ${source.title}. DOI: ${source.doi}`;
        finalMarkdown += `**[${index + 1}]** ${fullReference}\n\n`;
      });
    }

    const blob = new Blob([finalMarkdown], { type: 'text/markdown;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `${safeTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.md`;
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const handleDownloadPDF = async () => {
    if (isExportingPDF) return;
    setIsExportingPDF(true);
    try {
      const docTitle = currentFileName 
        ? currentFileName.replace(/\.[^/.]+$/, "") 
        : (activeDraftId ? drafts.find(d => d.id === activeDraftId)?.title : 'scholarcite_manuscript');
      const safeTitle = (docTitle || 'scholarcite_manuscript')
        .replace(/\.[^/.]+$/, "");
      const safeFilename = safeTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_') + '.pdf';

      // Create highly styled container for academic PDF compiling
      const element = document.createElement('div');
      element.className = 'academic-pdf-compile font-serif text-slate-900 p-12 max-w-4xl mx-auto';
      element.style.fontFamily = 'Georgia, Cambria, "Times New Roman", Times, serif';
      element.style.lineHeight = '1.6';
      element.style.color = '#1e293b'; // slate-800
      element.style.padding = '40px';

      // Assemble content
      let innerHtml = `
        <div style="border-bottom: 2px solid #0f172a; padding-bottom: 16px; margin-bottom: 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;">
          <h1 style="font-size: 26px; font-weight: bold; margin-bottom: 10px; color: #0f172a; line-height: 1.25;">
            ${safeTitle}
          </h1>
          <div style="display: flex; justify-content: space-between; font-size: 11px; color: #64748b; font-family: monospace; text-transform: uppercase;">
            <span>SewornaAI Scientific Workspace</span>
            <span>Date Exchanged: ${new Date().toLocaleDateString()}</span>
          </div>
        </div>
        
        <div class="draft-content" style="font-size: 14px; text-align: justify;">
          ${documentContent || '<p style="color: #94a3b8; font-style: italic;">No core draft content authored yet.</p>'}
        </div>
      `;

      // Append bibliography references nicely at the bottom on a clean page-break
      if (bibliography && bibliography.length > 0) {
        innerHtml += `
          <div style="page-break-before: always; margin-top: 40px; padding-top: 24px; border-top: 1px solid #cbd5e1;">
            <h2 style="font-size: 20px; font-family: Georgia, Cambria, serif; font-weight: bold; color: #0f172a; margin-bottom: 18px; border-bottom: 2px solid #e2e8f0; padding-bottom: 6px;">References</h2>
            <div style="font-size: 12px; line-height: 1.6;">
              ${bibliography.map((source, index) => {
                const citationData = source?.citations?.[citationStyle];
                const fullReference = citationData?.full || `${source.author} (${source.year}). ${source.title}. DOI: ${source.doi}`;
                return `
                  <div style="margin-bottom: 12px; padding-left: 28px; text-indent: -28px; text-align: justify;">
                    <span style="font-family: -apple-system, BlinkMacSystemFont, sans-serif; font-weight: bold; color: #4f46e5; margin-right: 8px;">[${index + 1}]</span>
                    ${fullReference}
                  </div>
                `;
              }).join('')}
            </div>
          </div>
        `;
      }

      element.innerHTML = innerHtml;

      const opt = {
        margin:       15,
        filename:     safeFilename,
        image:        { type: 'jpeg' as const, quality: 0.98 },
        html2canvas:  { scale: 2, useCORS: true, letterRendering: true, logging: false },
        jsPDF:        { unit: 'mm' as const, format: 'letter' as const, orientation: 'portrait' as const }
      };

      // Execute pdf save using standard html2pdf constructor
      await html2pdf().from(element).set(opt).save();
    } catch (err) {
      console.error('Failed to compile PDF manuscript:', err);
    } finally {
      setIsExportingPDF(false);
    }
  };

  const handleDownloadDocx = () => {
    setIsExportingDocx(true);
    try {
      const docTitle = currentFileName 
        ? currentFileName.replace(/\.[^/.]+$/, "") 
        : (activeDraftId ? drafts.find(d => d.id === activeDraftId)?.title : 'scholarcite_manuscript');
      const safeTitle = (docTitle || 'scholarcite_manuscript')
        .replace(/\.[^/.]+$/, "");
      
      let referencesHtml = '';
      if (bibliography && bibliography.length > 0) {
        referencesHtml = `
          <div style="page-break-before: always; margin-top: 40px; border-top: 1px solid #cbd5e1; padding-top: 20px;">
            <h2 style="font-family: Arial, sans-serif; font-size: 18pt; font-weight: bold; color: #0f172a; margin-bottom: 12pt;">References</h2>
            ${bibliography.map((source, index) => {
              const citationData = source?.citations?.[citationStyle];
              const fullReference = citationData?.full || `${source.author} (${source.year}). ${source.title}. DOI: ${source.doi}`;
              return `
                <p style="font-family: Arial, sans-serif; font-size: 11pt; line-height: 1.5; margin-bottom: 8pt; text-indent: -24pt; margin-left: 24pt;">
                  <strong style="color: #4f46e5;">[${index + 1}]</strong> ${fullReference}
                </p>
              `;
            }).join('')}
          </div>
        `;
      }

      const completeHtml = `
        <html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'>
        <head>
          <title>${safeTitle}</title>
          <!--[if gte mso 9]>
          <xml>
            <w:WordDocument>
              <w:View>Print</w:View>
              <w:Zoom>100</w:Zoom>
              <w:DoNotOptimizeForBrowser/>
            </w:WordDocument>
          </xml>
          <![endif]-->
          <style>
            body {
              font-family: 'Times New Roman', Times, serif;
              font-size: 12pt;
              line-height: 1.6;
              color: #000000;
            }
            h1, h2, h3, h4 {
              font-family: Arial, Helvetica, sans-serif;
              color: #0f172a;
              margin-top: 18pt;
              margin-bottom: 6pt;
            }
            h1 { font-size: 24pt; font-weight: bold; margin-bottom: 12pt; }
            h2 { font-size: 16pt; font-weight: bold; border-bottom: 1px solid #e2e8f0; padding-bottom: 4px; }
            h3 { font-size: 13pt; font-weight: bold; }
            p { margin-bottom: 10pt; text-align: justify; }
            ul, ol { margin-bottom: 10pt; padding-left: 20pt; }
            li { margin-bottom: 4pt; }
            code { font-family: 'Courier New', Courier, monospace; background-color: #f1f5f9; padding: 2px 4px; border-radius: 4px; font-size: 10pt; }
            strong { font-weight: bold; }
            em { font-style: italic; }
          </style>
        </head>
        <body>
          <div style="font-family: Arial, sans-serif; border-bottom: 2px solid #0f172a; padding-bottom: 12px; margin-bottom: 24px;">
            <h1 style="margin: 0; padding-bottom: 6px;">${safeTitle}</h1>
            <div style="display: flex; justify-content: space-between; font-size: 9pt; color: #475569;">
              <span>SewornaAI Scientific Workspace</span>
              <span>Compiled: ${new Date().toLocaleDateString()}</span>
            </div>
          </div>
          <div>
            ${documentContent || '<p style="color: #64748b; font-style: italic;">No core draft content authored yet.</p>'}
          </div>
          ${referencesHtml}
        </body>
        </html>
      `;

      const blob = new Blob(['\ufeff' + completeHtml], {
        type: 'application/msword;charset=utf-8'
      });
      
      const link = document.createElement('a');
      link.href = URL.createObjectURL(blob);
      link.download = `${safeTitle.toLowerCase().replace(/[^a-z0-9_-]/g, '_')}.doc`;
      document.body.appendChild(link);
      link.click();
      document.body.removeChild(link);
    } catch (err) {
      console.error('Word export error:', err);
    } finally {
      setIsExportingDocx(false);
    }
  };

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
      {/* Global Sticky Header with frosted blur effect */}
      <header className="sticky top-0 z-50 backdrop-blur-md bg-white/90 border-b border-slate-200/80 shadow-xs">
        <div className="max-w-7xl mx-auto px-4 py-4 sm:py-5 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-4 text-left">
            <div className="bg-indigo-600 rounded-xl p-2.5 shadow-[0_4px_20px_rgba(79,70,229,0.25)] text-white shrink-0">
              <GraduationCap className="w-6 h-6" />
            </div>
            <div>
              <h1 className="text-xl font-serif font-black text-slate-900 tracking-tight flex items-center justify-start gap-2.5">
                SewornaAI
                <span className="flex items-center gap-1.5 px-2 bg-emerald-50 border border-emerald-100 rounded-full text-[9px] font-mono font-bold text-emerald-700 uppercase tracking-widest leading-none py-1">
                  <span className="relative flex h-1.5 w-1.5">
                    <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-emerald-400 opacity-75"></span>
                    <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-emerald-500"></span>
                  </span>
                  LIVE
                </span>
              </h1>
              <p className="hidden md:block text-[11px] text-slate-400 font-sans tracking-wide leading-tight mt-0.5 max-w-sm">
                Authoritative research assistant matching claims to global academic publications.
              </p>
            </div>
          </div>

          <div className="flex flex-wrap items-center gap-4">
            {/* Functional Toggle Tabs Capsule */}
            <div className="flex bg-slate-100/80 p-1 rounded-xl border border-slate-200/60 shadow-inner">
              <button
                onClick={() => setActiveTab('editor')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-lg text-xs font-bold font-sans transition-all duration-300 cursor-pointer ${
                  activeTab === 'editor'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
                }`}
              >
                <FileText className="w-3.5 h-3.5" />
                Workspace
              </button>
              <button
                onClick={() => setActiveTab('doi')}
                className={`flex items-center justify-center gap-1.5 py-2 px-3.5 rounded-lg text-xs font-bold font-sans transition-all duration-300 cursor-pointer ${
                  activeTab === 'doi'
                    ? 'bg-indigo-600 text-white shadow-xs'
                    : 'text-slate-500 hover:text-slate-800 hover:bg-slate-50/50'
                }`}
              >
                <BookOpen className="w-3.5 h-3.5" />
                DOI Deep Search
              </button>
            </div>

            {/* Premium Google Auth Button */}
            {authLoading ? (
              <div className="flex items-center text-xs text-slate-450 gap-1 px-3 py-1.5">
                <Loader2 className="w-3.5 h-3.5 animate-spin" />
              </div>
            ) : user ? (
              <div className="flex items-center gap-2.5 bg-white border border-slate-200/60 pl-3 pr-1 py-1 rounded-xl shadow-xxs">
                <div className="hidden sm:block text-right">
                  <p className="text-[10px] font-bold text-slate-800 leading-none">{user.displayName || 'Scholar'}</p>
                  <p className="text-[9px] text-slate-400 font-mono mt-0.5 max-w-[100px] truncate leading-none">{user.email}</p>
                </div>
                {user.photoURL ? (
                  <img src={user.photoURL} alt="Scholar Avatar" className="w-7 h-7 rounded-lg border border-slate-200/80 shrink-0" referrerPolicy="no-referrer" />
                ) : (
                  <div className="w-7 h-7 rounded-lg bg-indigo-600 text-white flex items-center justify-center text-xs font-bold shrink-0">
                    {user.displayName?.[0] || 'U'}
                  </div>
                )}
                <button
                  onClick={handleSignOut}
                  title="Sign out from workspace"
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors cursor-pointer"
                >
                  <LogOut className="w-3.5 h-3.5" />
                </button>
              </div>
            ) : (
              <button
                onClick={handleGoogleSignIn}
                className="flex items-center gap-2.5 bg-slate-900 border border-slate-950 text-white hover:bg-slate-800 font-sans font-bold text-xs px-4 py-2 rounded-xl transition-all hover:scale-[1.01] cursor-pointer shadow-xs"
              >
                <svg className="w-3.5 h-3.5 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                  <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                  <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                  <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
                  <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                </svg>
                <span>Google Login</span>
              </button>
            )}
          </div>
        </div>
      </header>

      {/* Main Container Workspace */}
      <main className="max-w-7xl mx-auto px-4 py-8">
        {authError && (
          <div className="mb-6 p-4.5 bg-rose-50 border border-rose-200/55 text-rose-905 rounded-xl flex items-center justify-between shadow-sm animate-in fade-in slide-in-from-top-4 duration-200">
            <div className="flex items-start gap-3">
              <AlertCircle className="w-5 h-5 text-rose-550 shrink-0 mt-0.5" />
              <p className="text-xs font-semibold leading-relaxed font-sans">{authError}</p>
            </div>
            <button
              onClick={() => setAuthError(null)}
              className="p-1 text-rose-650 hover:text-rose-900 rounded-lg hover:bg-rose-100 transition-colors cursor-pointer"
              title="Dismiss integration alert"
            >
              <X className="w-4 h-4" />
            </button>
          </div>
        )}
        {activeTab === 'editor' ? (
          <div className="grid grid-cols-1 lg:grid-cols-12 gap-8 items-start animate-in fade-in duration-300">
            
            {/* LEFT COLUMN: Workspace Draft Manager Panel (5 / 12 width) */}
            <section className="lg:col-span-5 flex flex-col gap-8">
              
              {/* Cloud Storage integration premium dark overview widget */}
              <div className="bg-gradient-to-br from-indigo-950 via-slate-900 to-slate-950 border border-slate-800 rounded-2xl p-6 shadow-xl text-slate-100 flex flex-col gap-5 relative overflow-hidden">
                {/* Decorative ambient gradient backdrop */}
                <div className="absolute top-0 right-0 w-32 h-32 bg-indigo-550/10 rounded-full blur-3xl pointer-events-none"></div>

                <div className="flex items-center justify-between border-b border-slate-800/80 pb-4">
                  <div className="flex items-center gap-3">
                    <div className="relative">
                      <Cloud className={`w-6 h-6 shrink-0 ${user ? 'text-teal-400 animate-[pulse_2.5s_infinite_ease-in-out]' : 'text-slate-500'}`} />
                      <span className="absolute -top-1.5 -right-1.5 flex h-2 w-2">
                        <span className="animate-ping absolute inline-flex h-full w-full rounded-full bg-indigo-400 opacity-75"></span>
                        <span className="relative inline-flex rounded-full h-1.5 w-1.5 bg-indigo-500"></span>
                      </span>
                    </div>
                    <div>
                      <h2 className="text-sm font-sans font-extrabold tracking-wide uppercase text-slate-200">Cloud Sync Console</h2>
                      <p className="text-[10px] text-indigo-300 font-sans tracking-wide leading-none mt-1">Real-time backup & multi-file draft vault</p>
                    </div>
                  </div>

                  {user && (
                    <button
                      onClick={() => handleCreateNewCloudDraft()}
                      disabled={isCreatingDraft}
                      className="text-xxs font-bold font-sans text-white hover:text-white flex items-center justify-center gap-1.5 bg-indigo-600/80 hover:bg-indigo-600 border border-indigo-500/35 px-3 py-1.5 rounded-lg transition-all hover:scale-[1.01] cursor-pointer disabled:opacity-50"
                    >
                      <Plus className="w-3 h-3" />
                      Add Workspace
                    </button>
                  )}
                </div>

                {/* Integration states */}
                {!user ? (
                  <div className="bg-white/5 border border-white/10 rounded-xl p-4.5 space-y-4.5 text-center">
                    <p className="text-xs text-slate-305 font-sans leading-relaxed">
                      Connect your academic identity to enable continuous real-time cloud backup, manage multiple papers, and preserve inline bibliographies.
                    </p>
                    <button
                      onClick={handleGoogleSignIn}
                      className="w-full flex items-center justify-center gap-2.5 bg-white hover:bg-slate-50 text-slate-950 font-sans font-bold text-xs py-2.5 rounded-xl shadow-md transition-all hover:scale-[1.01] active:scale-[0.99] cursor-pointer"
                    >
                      <svg className="w-4 h-4 shrink-0" viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
                        <path d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" fill="#4285F4"/>
                        <path d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" fill="#34A853"/>
                        <path d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.06H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.94l3.66-2.85z" fill="#FBBC05"/>
                        <path d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.06l3.66 2.85c.87-2.6 3.3-4.53 6.16-4.53z" fill="#EA4335"/>
                      </svg>
                      <span>Link Google Account</span>
                    </button>
                  </div>
                ) : (
                  <div className="space-y-4">
                    {/* Drafts List Catalog */}
                    {draftsLoading ? (
                      <div className="flex flex-col items-center justify-center py-8 text-indigo-300 gap-2.5">
                        <Loader2 className="w-6 h-6 animate-spin text-indigo-400" />
                        <span className="text-[10px] font-mono uppercase tracking-widest text-slate-400">Syncing workspaces...</span>
                      </div>
                    ) : drafts.length === 0 ? (
                      <div className="text-center py-6 border border-dashed border-slate-800 bg-white/3 rounded-xl p-3.5">
                        <FileText className="w-6 h-6 text-indigo-400/70 mx-auto mb-2" />
                        <p className="text-xs font-bold text-slate-200">No backup workspaces yet</p>
                        <p className="text-[10px] text-slate-400 leading-normal max-w-[190px] mx-auto mt-1">
                          Click above or write below then save your active draft to the cloud.
                        </p>
                      </div>
                    ) : (
                      <div className="space-y-2.5 max-h-[300px] overflow-y-auto pr-1">
                        {drafts.map((draft) => (
                          <div 
                            key={draft.id}
                            onClick={() => handleLoadDraft(draft)}
                            className={`group flex items-center justify-between p-3.5 rounded-xl border text-left transition-all duration-300 cursor-pointer ${
                              activeDraftId === draft.id 
                                ? 'bg-indigo-600/20 border-indigo-500 shadow-md ring-1 ring-indigo-550/20' 
                                : 'bg-white/3 hover:bg-white/5 border-slate-800/80 hover:border-slate-750'
                            }`}
                          >
                            <div className="flex items-start gap-2.5 min-w-0 flex-1">
                              <FileText className={`w-4 h-4 mt-0.5 shrink-0 ${activeDraftId === draft.id ? 'text-indigo-400' : 'text-slate-500'}`} />
                              <div className="min-w-0 flex-1">
                                {renamingDraftId === draft.id ? (
                                  <div className="flex items-center gap-1.5" onClick={(e) => e.stopPropagation()}>
                                    <input 
                                      type="text" 
                                      value={renamingTitle}
                                      onChange={(e) => setRenamingTitle(e.target.value)}
                                      className="text-xs border border-indigo-505 bg-slate-900 rounded-lg px-2.5 py-1 w-full text-slate-100 focus:outline-none"
                                      autoFocus
                                    />
                                    <button 
                                      onClick={() => submitRenameDraft(draft.id)}
                                      className="p-1 text-emerald-400 hover:bg-emerald-500/10 rounded-lg"
                                    >
                                      <Check className="w-3.5 h-3.5" />
                                    </button>
                                    <button 
                                      onClick={() => setRenamingDraftId(null)}
                                      className="p-1 text-rose-450 hover:bg-rose-500/10 rounded-lg"
                                    >
                                      <X className="w-3.5 h-3.5" />
                                    </button>
                                  </div>
                                ) : (
                                  <>
                                    <p className="text-xs font-bold text-slate-200 truncate" title={draft.title}>
                                      {draft.title || 'Untitled Draft'}
                                    </p>
                                    <div className="flex items-center gap-1.5 text-[10px] text-slate-500 mt-1 font-sans">
                                      <span className="truncate text-indigo-300 font-semibold">{draft.bibliography?.length || 0} citations</span>
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
                              <div className="flex items-center gap-1 opacity-20 group-hover:opacity-100 transition-opacity ml-2" onClick={(e) => e.stopPropagation()}>
                                <button 
                                  onClick={(e) => startRenameDraft(draft, e)}
                                  className="p-1 hover:bg-white/10 text-slate-400 hover:text-slate-205 rounded-lg"
                                  title="Rename workspace"
                                >
                                  <Edit2 className="w-3 h-3" />
                                </button>
                                <button 
                                  onClick={(e) => handleDeleteDraft(draft.id, e)}
                                  aria-label="Delete Draft"
                                  disabled={isDeletingDraftId === draft.id}
                                  className="p-1 hover:bg-rose-500/15 text-rose-400 hover:text-rose-300 rounded disabled:opacity-50"
                                  title="Delete draft"
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
                  <div className="bg-white/5 border-l-4 border-indigo-500 rounded-r-xl p-4 space-y-2 mt-1">
                    <p className="text-xs font-bold text-slate-200">Standalone Project Draft</p>
                    <p className="text-[10px] text-slate-400 leading-normal">
                      You are currently drafting offline. Convert this project to a Cloud Workspace to keep changes synchronized.
                    </p>
                    <button
                      onClick={handleSaveWorkspaceToCloud}
                      disabled={isCreatingDraft}
                      className="w-full flex items-center justify-center gap-2 bg-indigo-650 hover:bg-indigo-700 text-white font-bold font-sans text-xs py-2 px-3 rounded-xl shadow-md transition-all duration-300 cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                    >
                      {isCreatingDraft ? (
                        <Loader2 className="w-3.5 h-3.5 animate-spin" />
                      ) : (
                        <PlusCircle className="w-3.5 h-3.5 text-white" />
                      )}
                      <span>Sync Draft with cloud vault</span>
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

              {/* Premium Manuscript and Draft Export Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 flex flex-col space-y-4 hover:shadow-md transition-all duration-300 animate-in fade-in duration-300" id="manuscript-export-sidebar">
                <div>
                  <h2 className="text-sm font-sans font-extrabold tracking-wide uppercase text-slate-805 flex items-center gap-2">
                    <FileDown className="w-4 h-4 text-indigo-600" />
                    Export Document
                  </h2>
                  <p className="text-[11px] text-slate-500 font-sans mt-0.5">Compile draft and references into formatted documents</p>
                </div>

                <div className="grid grid-cols-1 gap-2.5">
                  {/* PDF formatted layout compiler */}
                  <button
                    onClick={handleDownloadPDF}
                    disabled={isExportingPDF}
                    className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-indigo-50/20 hover:border-indigo-100/50 transition-all text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-rose-50 border border-rose-100 flex items-center justify-center text-rose-600 font-bold shrink-0 text-xxs">
                        PDF
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 leading-tight">Formatted PDF</p>
                        <p className="text-[10px] text-slate-400 font-sans leading-none mt-0.5">Academic font, citation breaks</p>
                      </div>
                    </div>
                    {isExportingPDF ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
                    )}
                  </button>

                  {/* Microsoft Word Document Exporter */}
                  <button
                    onClick={handleDownloadDocx}
                    disabled={isExportingDocx}
                    className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-indigo-50/20 hover:border-indigo-100/50 transition-all text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-blue-50 border border-blue-100 flex items-center justify-center text-blue-600 font-bold shrink-0 text-xxs">
                        DOCX
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 leading-tight">Word Manuscript</p>
                        <p className="text-[10px] text-slate-400 font-sans leading-none mt-0.5">Preserves fonts & styled lists</p>
                      </div>
                    </div>
                    {isExportingDocx ? (
                      <Loader2 className="w-3.5 h-3.5 animate-spin text-indigo-600 shrink-0" />
                    ) : (
                      <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
                    )}
                  </button>

                  {/* Markdown backup plain exporter */}
                  <button
                    onClick={handleDownloadMarkdown}
                    className="flex items-center justify-between p-3 border border-slate-100 rounded-xl bg-slate-50/50 hover:bg-indigo-50/20 hover:border-indigo-100/50 transition-all text-left group cursor-pointer"
                  >
                    <div className="flex items-center gap-2.5 min-w-0">
                      <div className="w-8 h-8 rounded-lg bg-emerald-50 border border-emerald-100 flex items-center justify-center text-emerald-600 font-bold shrink-0 text-xxs">
                        MD
                      </div>
                      <div className="min-w-0">
                        <p className="text-xs font-bold text-slate-800 leading-tight">Markdown Document</p>
                        <p className="text-[10px] text-slate-400 font-sans leading-none mt-0.5">Minimalist writing format</p>
                      </div>
                    </div>
                    <Download className="w-3.5 h-3.5 text-slate-400 group-hover:text-indigo-600 transition-colors shrink-0" />
                  </button>
                </div>
              </div>

              {/* Premium Bibliography Export Card */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/80 p-6 flex flex-col space-y-4 hover:shadow-md transition-all duration-300 animate-in fade-in duration-300" id="bibliography-export-sidebar">
                <div>
                  <h2 className="text-sm font-sans font-extrabold tracking-wide uppercase text-slate-805 flex items-center gap-2">
                    <BookOpen className="w-4 h-4 text-indigo-600" />
                    Bibliography Export
                  </h2>
                  <p className="text-[11px] text-slate-500 font-sans mt-0.5">Export active references to standard citation formats</p>
                </div>

                {bibliography.length === 0 ? (
                  <div className="bg-slate-50 border border-slate-100 rounded-xl p-4.5 text-center space-y-2">
                    <AlertCircle className="w-4 h-4 text-slate-400 mx-auto" />
                    <p className="text-xs font-bold text-slate-550 font-sans">No references to export</p>
                    <p className="text-[10px] text-slate-400 font-sans leading-relaxed">
                      Highlight claims inside your active paper draft and associate citations to compile your academic bibliography.
                    </p>
                  </div>
                ) : (
                  <div className="space-y-4 animate-in fade-in duration-200">
                    {/* Status row */}
                    <div className="flex items-center justify-between text-xs bg-indigo-50/30 border border-indigo-100/50 px-3.5 py-2.5 rounded-xl">
                      <span className="font-sans font-semibold text-slate-600">Active Records:</span>
                      <span className="font-sans font-bold text-indigo-600 px-2.5 py-0.5 bg-indigo-150 border border-indigo-100 rounded-full text-[10px]">
                        {bibliography.length} {bibliography.length === 1 ? 'citation' : 'citations'}
                      </span>
                    </div>

                    {/* BibTeX Export Group */}
                    <div className="space-y-2 border border-slate-100 p-3.5 rounded-xl bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 font-sans">BibTeX Format (.bib)</span>
                        {copiedFormat === 'bibtex' && (
                          <span className="text-[10px] font-semibold font-sans text-emerald-600 flex items-center gap-0.5 animate-pulse">
                            <Check className="w-3.5 h-3.5 animate-bounce" /> Copied!
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-sans leading-normal">
                        Standard plain text reference format widely matched by LaTeX, Overleaf, and Zotero.
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          onClick={() => handleDownloadBibliography('bibtex')}
                          className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-sans py-2 px-3 rounded-lg shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                        <button
                          onClick={() => handleCopyBibliography('bibtex')}
                          className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-205 text-slate-705 text-xs font-bold font-sans py-2 px-3 rounded-lg shadow-xxs hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          Copy Raw
                        </button>
                      </div>
                    </div>

                    {/* RIS Export Group */}
                    <div className="space-y-2 border border-slate-100 p-3.5 rounded-xl bg-slate-50/50">
                      <div className="flex items-center justify-between">
                        <span className="text-xs font-bold text-slate-800 font-sans">RIS Format (.ris)</span>
                        {copiedFormat === 'ris' && (
                          <span className="text-[10px] font-semibold font-sans text-emerald-600 flex items-center gap-0.5 animate-pulse">
                            <Check className="w-3.5 h-3.5 animate-bounce" /> Copied!
                          </span>
                        )}
                      </div>
                      <p className="text-[10px] text-slate-500 font-sans leading-normal">
                        Database standard supporting Mendeley, EndNote, and global academic indexing platforms.
                      </p>
                      <div className="grid grid-cols-2 gap-2 mt-1">
                        <button
                          onClick={() => handleDownloadBibliography('ris')}
                          className="flex items-center justify-center gap-1.5 bg-indigo-600 hover:bg-indigo-700 text-white text-xs font-bold font-sans py-2 px-3 rounded-lg shadow-xs hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                        >
                          <Download className="w-3.5 h-3.5" />
                          Download
                        </button>
                        <button
                          onClick={() => handleCopyBibliography('ris')}
                          className="flex items-center justify-center gap-1.5 bg-white hover:bg-slate-50 border border-slate-205 text-slate-705 text-xs font-bold font-sans py-2 px-3 rounded-lg shadow-xxs hover:scale-[1.01] active:scale-[0.99] transition-all cursor-pointer"
                        >
                          <Copy className="w-3.5 h-3.5 text-slate-400" />
                          Copy Raw
                        </button>
                      </div>
                    </div>
                  </div>
                )}
              </div>
            </section>

            {/* RIGHT COLUMN: Interactive Document Editor Canvas (8 / 12 width) */}
            <section className="lg:col-span-7 flex flex-col gap-6">
              
              {/* Status Alert Ribbon representing Real-time Cloud Save */}
              <div className="flex items-center justify-between px-5 py-4 bg-white border border-slate-200/80 rounded-2xl shadow-xxs">
                <div className="flex items-center gap-3">
                  <div className={`w-2.5 h-2.5 rounded-full ${
                    syncStatus === 'saved' 
                      ? 'bg-emerald-500 animate-pulse' 
                      : syncStatus === 'saving' 
                      ? 'bg-amber-400 animate-pulse' 
                      : 'bg-slate-400'
                  }`} />
                  <div className="space-y-0.5">
                    <p className="text-xs font-bold text-slate-805">{syncMessage}</p>
                    <p className="text-[10px] font-mono text-slate-400 uppercase tracking-wider leading-none">
                      {activeDraftId ? `Workspace ID: ${activeDraftId}` : 'Standalone memory mode'}
                    </p>
                  </div>
                </div>
                
                {activeDraftId && (
                  <span className="text-[10px] font-mono font-bold text-teal-650 bg-teal-50 px-2.5 py-0.5 rounded-lg border border-teal-100/50">
                    Live Synced
                  </span>
                )}
              </div>

              {/* Central Editor Canvas Layout Panel */}
              <div className="bg-white rounded-2xl shadow-sm border border-slate-200/85 p-6 flex flex-col gap-4">
                <div className="pb-3 border-b border-slate-100 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-3">
                  <div className="flex items-center gap-2">
                    <Sparkles className="w-4 h-4 text-indigo-600" />
                    <span className="text-xs font-extrabold text-slate-505 font-sans uppercase tracking-wider">
                      Active Paper Workspace
                    </span>
                  </div>

                  <div className="flex items-center gap-2 flex-wrap">
                    {/* Quick PDF compile button */}
                    <button
                      onClick={handleDownloadPDF}
                      disabled={isExportingPDF}
                      title="Compile and download formatted PDF"
                      className="flex items-center gap-1.5 bg-rose-50 hover:bg-rose-100/80 text-rose-700 border border-rose-200 hover:border-rose-300 px-3 py-1.5 rounded-lg text-xxs font-sans font-bold transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                    >
                      {isExportingPDF ? (
                        <Loader2 className="w-3 h-3 animate-spin text-rose-600" />
                      ) : (
                        <FileDown className="w-3 h-3 text-rose-500" />
                      )}
                      <span>Export PDF</span>
                    </button>

                    {/* Quick Word Document Export button */}
                    <button
                      onClick={handleDownloadDocx}
                      disabled={isExportingDocx}
                      title="Download as Microsoft Word document"
                      className="flex items-center gap-1.5 bg-blue-50 hover:bg-blue-100/80 text-blue-700 border border-blue-200 hover:border-blue-300 px-3 py-1.5 rounded-lg text-xxs font-sans font-bold transition-all cursor-pointer hover:scale-[1.01] active:scale-[0.99]"
                    >
                      {isExportingDocx ? (
                        <Loader2 className="w-3 h-3 animate-spin text-blue-600" />
                      ) : (
                        <FileDown className="w-3 h-3 text-blue-500" />
                      )}
                      <span>Export Word</span>
                    </button>

                    {currentFileName && (
                      <span className="text-xxs font-mono text-indigo-600 bg-indigo-50/50 px-2.5 py-1.5 rounded-lg border border-indigo-100/40">
                        {currentFileName}
                      </span>
                    )}
                  </div>
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
      <footer className="max-w-7xl mx-auto px-4 mt-16 py-8 border-t border-slate-200 text-center flex flex-col sm:flex-row items-center justify-between gap-4">
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
