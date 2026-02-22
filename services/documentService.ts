import * as mammoth from "mammoth";
import * as pdfjsLib from "pdfjs-dist";
import pdfWorker from "pdfjs-dist/build/pdf.worker.min.js?url";
import { Document, Packer, Paragraph, TextRun, HeadingLevel, PageBreak, AlignmentType } from "docx";
import saveAs from "file-saver";
import JSZip from "jszip";
import PptxGenJS from "pptxgenjs";
import html2pdf from "html2pdf.js";
import { BibliographyEntry } from "../types";

// Handle module import structure (fix for "Cannot set properties of undefined" error)
// In some environments, pdfjs-dist is exported as a default object within the module namespace.
const pdfjs = (pdfjsLib as any).default || pdfjsLib;

// Configure PDF.js worker
if (pdfjs.GlobalWorkerOptions) {
  pdfjs.GlobalWorkerOptions.workerSrc = pdfWorker;
}

export const parseDocument = async (file: File): Promise<string> => {
  const extension = file.name.split('.').pop()?.toLowerCase();

  if (extension === 'docx') {
    return parseDocx(file);
  } else if (extension === 'pdf') {
    return parsePdf(file);
  } else if (extension === 'pptx') {
    return parsePptx(file);
  } else if (extension === 'txt') {
    return await file.text();
  } else {
    throw new Error(`Unsupported file type: .${extension}`);
  }
};

const parseDocx = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    const result = await mammoth.extractRawText({ arrayBuffer });
    return result.value;
  } catch (error) {
    console.error("Error parsing DOCX:", error);
    throw new Error("Failed to read Word document.");
  }
};

const parsePdf = async (file: File): Promise<string> => {
  try {
    const arrayBuffer = await file.arrayBuffer();
    // Use the resolved pdfjs object
    const loadingTask = pdfjs.getDocument({ data: arrayBuffer });
    const pdf = await loadingTask.promise;
    let fullText = "";

    for (let i = 1; i <= pdf.numPages; i++) {
      const page = await pdf.getPage(i);
      const textContent = await page.getTextContent();
      const pageText = textContent.items.map((item: any) => item.str).join(' ');
      fullText += pageText + "\n\n";
    }

    return fullText.trim();
  } catch (error) {
    console.error("Error parsing PDF:", error);
    throw new Error("Failed to read PDF document.");
  }
};

const parsePptx = async (file: File): Promise<string> => {
  try {
    const zip = await JSZip.loadAsync(file);
    const textParts: string[] = [];

    // Identify slide files
    const slideFiles = Object.keys(zip.files).filter(fileName => 
      fileName.startsWith("ppt/slides/slide") && fileName.endsWith(".xml")
    );

    // Sort naturally (slide1, slide2, slide10 instead of slide1, slide10, slide2)
    slideFiles.sort((a, b) => {
      const numA = parseInt(a.match(/slide(\d+)\.xml/)![1]);
      const numB = parseInt(b.match(/slide(\d+)\.xml/)![1]);
      return numA - numB;
    });

    const parser = new DOMParser();

    for (const fileName of slideFiles) {
      const xmlString = await zip.files[fileName].async("string");
      const xmlDoc = parser.parseFromString(xmlString, "application/xml");
      
      // Extract text from <a:t> tags
      const textNodes = xmlDoc.getElementsByTagName("a:t");
      let slideText = "";
      for (let i = 0; i < textNodes.length; i++) {
        slideText += textNodes[i].textContent + " ";
      }
      
      if (slideText.trim()) {
        textParts.push(slideText.trim());
      }
    }

    return textParts.join("\n\n");
  } catch (error) {
    console.error("Error parsing PPTX:", error);
    throw new Error("Failed to read PowerPoint presentation.");
  }
};

export const exportToPdf = (elementId: string, filename: string = 'ScholarCite_Document.pdf') => {
  const element = document.getElementById(elementId);
  if (!element) return;

  // We need to ensure the element is visible for html2pdf to capture it.
  // Tailwind 'hidden' sets display: none. We override it with inline style.
  const originalDisplay = element.style.display;
  element.style.display = 'block';

  const opt = {
    margin: 0.5,
    filename: filename,
    image: { type: 'jpeg', quality: 0.98 },
    html2canvas: { scale: 2, useCORS: true, letterRendering: true },
    jsPDF: { unit: 'in', format: 'letter', orientation: 'portrait' },
    pagebreak: { mode: ['css', 'legacy'] }
  };

  html2pdf()
    .from(element)
    .set(opt)
    .save()
    .then(() => {
      element.style.display = originalDisplay;
    })
    .catch((err: any) => {
      console.error("PDF generation failed:", err);
      element.style.display = originalDisplay;
      alert("Failed to generate PDF. Please try again.");
    });
};

// Helper: Convert text with *italics* or Unicode italics into docx TextRun objects
const parseTextToRuns = (text: string, font: string = "Calibri", size: number = 24): TextRun[] => {
  // First, map Unicode italics to markdown style for unified processing
  // 𝑒𝑡 𝑎𝑙. -> *et al.*
  const unicodeItalicRegex = /𝑒𝑡 𝑎𝑙\./gu;
  const normalized = text.replace(unicodeItalicRegex, "*et al.*");

  const parts = normalized.split(/(\*.*?\*)/g);
  return parts.map(part => {
    if (part.startsWith('*') && part.endsWith('*')) {
      return new TextRun({
        text: part.slice(1, -1),
        italics: true,
        font,
        size
      });
    }
    return new TextRun({
      text: part,
      font,
      size
    });
  });
};

export const exportToWord = async (content: string, bibliography: BibliographyEntry[], styleName: string) => {
  const contentParagraphs = content.split('\n').map(line => 
    new Paragraph({
      // Now using parseTextToRuns for body content too, to catch "et al."
      children: parseTextToRuns(line, "Calibri", 24), 
      spacing: { after: 200 },
    })
  );

  const bibTitle = new Paragraph({
    text: "Bibliography",
    heading: HeadingLevel.HEADING_1,
    pageBreakBefore: true,
    spacing: { after: 300 }
  });

  const styleInfo = new Paragraph({
    text: `Style: ${styleName}`,
    style: "Heading 2",
    spacing: { after: 300 }
  });

  const bibParagraphs = bibliography.map(entry => 
    new Paragraph({
      children: parseTextToRuns(entry.text), // Use parsed runs for italics
      indent: { left: 720, hanging: 720 },
      spacing: { after: 200 }
    })
  );

  const doc = new Document({
    sections: [{
      properties: {},
      children: [
        ...contentParagraphs,
        bibTitle,
        styleInfo,
        ...bibParagraphs
      ],
    }],
  });

  const blob = await Packer.toBlob(doc);
  saveAs(blob, "ScholarCite_Document.docx");
};

export const exportToPptx = async (content: string, bibliography: BibliographyEntry[], styleName: string) => {
  const pres = new PptxGenJS();
  
  // Title Slide
  const slide1 = pres.addSlide();
  slide1.addText("Research Paper", { x: 1, y: 1.5, w: '80%', fontSize: 36, bold: true, align: 'center' });
  slide1.addText("Generated by ScholarCite", { x: 1, y: 3, w: '80%', fontSize: 18, align: 'center', color: '888888' });

  // Helper to parse content with mixed formatting
  const parseContentForSlide = (text: string) => {
    const unicodeItalicRegex = /𝑒𝑡 𝑎𝑙\./gu;
    const normalized = text.replace(unicodeItalicRegex, "*et al.*");
    
    const textObjects: any[] = [];
    const parts = normalized.split(/(\*.*?\*)/g);
    
    parts.forEach(part => {
      if (part.startsWith('*') && part.endsWith('*')) {
        textObjects.push({ text: part.slice(1, -1), options: { italic: true } });
      } else if (part) {
        textObjects.push({ text: part });
      }
    });
    return textObjects;
  };

  // Content Slides
  const paragraphs = content.split('\n').filter(p => p.trim() !== "");
  let currentSlide = pres.addSlide();
  
  // We'll simplify slide layout logic for mixed formatting: 
  // just put paragraphs in separate text boxes or accumulate text objects?
  // PptxGenJS addText accepts an array of text objects.
  
  let currentY = 0.5;
  const MARGIN_BOTTOM = 0.5;
  
  for (const para of paragraphs) {
    if (currentY > 6.5) { // New slide if we run out of space
       currentSlide = pres.addSlide();
       currentY = 0.5;
    }
    
    const textObjects = parseContentForSlide(para);
    currentSlide.addText(textObjects, { x: 0.5, y: currentY, w: '90%', fontSize: 16, align: 'left', valign: 'top' });
    
    // Estimate height of paragraph roughly
    const estimatedHeight = Math.ceil(para.length / 90) * 0.3 + 0.1;
    currentY += estimatedHeight;
  }

  // Bibliography Section
  if (bibliography.length > 0) {
    let bibSlide = pres.addSlide();
    bibSlide.addText("Bibliography", { x: 0.5, y: 0.5, fontSize: 24, bold: true });
    bibSlide.addText(`Style: ${styleName}`, { x: 0.5, y: 1.0, fontSize: 12, color: '666666' });
    
    let bibY = 1.5;
    const MAX_BIB_PER_SLIDE = 5; 
    let entriesOnSlide = 0;

    for (const entry of bibliography) {
      if (entriesOnSlide >= MAX_BIB_PER_SLIDE) {
        bibSlide = pres.addSlide();
        bibSlide.addText("Bibliography (cont.)", { x: 0.5, y: 0.5, fontSize: 24, bold: true });
        bibY = 1.5;
        entriesOnSlide = 0;
      }

      const textObjects = parseContentForSlide(entry.text);
      bibSlide.addText(textObjects, { x: 0.5, y: bibY, w: '90%', fontSize: 12 });
      bibY += 0.8;
      entriesOnSlide++;
    }
  }

  await pres.writeFile({ fileName: "ScholarCite_Presentation.pptx" });
};
