import { GoogleGenAI } from "@google/genai";
import { CitationResult, Source } from "../types";

// Helper to clean JSON string if the model adds markdown formatting
const cleanJsonString = (str: string): string => {
  let cleaned = str.trim();
  if (cleaned.startsWith("```json")) {
    cleaned = cleaned.replace(/^```json/, "").replace(/```$/, "");
  } else if (cleaned.startsWith("```")) {
    cleaned = cleaned.replace(/^```/, "").replace(/```$/, "");
  }
  return cleaned;
};

export const searchForSources = async (query: string, context: string): Promise<{ suggested: Source[], related: Source[] }> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });

  // Truncate context to a reasonable length to avoid overwhelming the prompt/tokens if doc is huge
  const trimmedContext = context.length > 5000 ? context.substring(0, 5000) + "..." : context;

  const prompt = `
    I am writing a research paper. 
    
    DOCUMENT CONTEXT:
    "${trimmedContext}"
    
    SELECTED TEXT TO CITE:
    "${query}"
    
    TASK:
    Perform a Google Search to find real, high-quality academic sources (journals, books, official reports) that support, refute, or elaborate on the SELECTED TEXT. 
    
    Use the DOCUMENT CONTEXT to:
    1. Disambiguate terms in the selected text.
    2. Understand the specific topic, field of study, and angle of the paper.
    3. Refine the search queries to be specific rather than generic.

    CRITICAL INSTRUCTIONS FOR URLS (READ CAREFULLY):
    1. You MUST extract the **EXACT, FULL, DEEP LINK** (URI) from the search result metadata.
    2. **DO NOT** return a root domain (e.g., "https://www.nature.com/") unless it's the only option.
    3. **DO NOT** use Google Search result links (e.g. "google.com/url?..."). Extract the actual destination URL.
    4. **DO NOT** invent or guess URLs.
    5. Prioritize direct links to PDFs or article landing pages.

    Return JSON:
    {
      "suggested": [Top 2 highly relevant sources directly supporting the text],
      "related": [2 broader/alternative sources or sources providing background]
    }

    Fields per source: 
    - title
    - author (CRITICAL: List ALL authors found. Use "Surname, Initials" format if available, e.g. "Abdolahi, M. and Adelnia, A.". Do NOT simplify.)
    - year
    - publication
    - snippet (very brief summary of relevance)
    - url (THE EXACT DEEP LINK to the specific resource)
    - doi (Optional string, only if explicitly found)
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        tools: [{ googleSearch: {} }],
        responseMimeType: "application/json"
      },
    });

    const text = response.text;
    if (!text) return { suggested: [], related: [] };

    const parsed = JSON.parse(cleanJsonString(text));
    return {
      suggested: parsed.suggested || [],
      related: parsed.related || []
    };
  } catch (error) {
    console.error("Error searching sources:", error);
    return { suggested: [], related: [] };
  }
};

export const formatCitation = async (source: Source, style: string): Promise<CitationResult> => {
  if (!process.env.API_KEY) {
    throw new Error("API Key is missing.");
  }

  const ai = new GoogleGenAI({ apiKey: process.env.API_KEY });
  
  const today = new Date().toLocaleDateString('en-GB', { day: 'numeric', month: 'long', year: 'numeric' });

  const prompt = `
    Create a citation for the following academic source in ${style} style.
    
    Source Details:
    Title: ${source.title}
    Author: ${source.author} (Use exactly as provided: "${source.author}")
    Year: ${source.year}
    Publication: ${source.publication}
    URL: ${source.url}
    DOI: ${source.doi || "N/A"}
    Access Date: ${today}

    CRITICAL FORMATTING INSTRUCTIONS:
    1. Return JSON with two fields: "inText" and "bibliography".
    2. "inText": The in-text citation (e.g., "(Smith, 2023)"). 
       - MUST BE PLAIN TEXT. Do NOT use asterisks or markdown.
       - If "et al." is required, write it simply as "et al." without formatting.
    3. "bibliography": The full reference list entry.
       - Use the FULL author information provided.
       - Do NOT simplify "Smith, J. and Doe, B." to "Smith and Doe".
       - ITALICS: Use asterisks (*) to surround text that should be italicized (e.g. *Journal Name*).
    
    4. URL HANDLING - STRICT PLACEHOLDER STRATEGY:
       - **DO NOT** write the actual URL in the "bibliography" string.
       - If the style (${style}) requires a URL (e.g. "Available at: ..." or "Retrieved from ..."), insert the text "{{URL_PLACEHOLDER}}" exactly where the URL should go.
       - Example (Harvard): "Surname, I. (Year) 'Title', *Publication*. Available at: {{URL_PLACEHOLDER}} (Accessed: ${today})."
       - Example (APA): "Surname, I. (Year). *Title*. Publication. Retrieved from {{URL_PLACEHOLDER}}"
       - If a DOI is present ("${source.doi || "N/A"}") AND the style prefers DOI over URL, use the DOI instead of the placeholder.
       - Otherwise, use {{URL_PLACEHOLDER}}.

    Return JSON structure:
    {
      "inText": "...",
      "bibliography": "..."
    }
  `;

  try {
    const response = await ai.models.generateContent({
      model: "gemini-3-flash-preview",
      contents: prompt,
      config: {
        responseMimeType: "application/json"
      }
    });

    const text = response.text;
    if (!text) throw new Error("No response from AI");

    const parsed = JSON.parse(cleanJsonString(text));

    // Post-processing: Replace placeholder with actual source URL
    // This prevents the LLM from hallucinating or altering the URL
    let bibliography = parsed.bibliography;
    if (bibliography && typeof bibliography === 'string') {
        bibliography = bibliography.replace(/\{\{URL_PLACEHOLDER\}\}/g, source.url);
    }

    // Post-processing: Replace "et al." with Unicode mathematical italics "𝑒𝑡 𝑎𝑙."
    const etAlUnicode = "𝑒𝑡 𝑎𝑙.";
    const inText = parsed.inText.replace(/et al\./g, etAlUnicode);

    return {
      inText: inText,
      bibliography: bibliography
    };
  } catch (error) {
    console.error("Error formatting citation:", error);
    // Fallback if AI fails
    return {
      inText: `(${source.author}, ${source.year})`,
      bibliography: `${source.author} (${source.year}). ${source.title}. ${source.publication}. Available at: ${source.url}`
    };
  }
};
