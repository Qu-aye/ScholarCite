import express from 'express';
import path from 'path';
import { createServer as createViteServer } from 'vite';
import { GoogleGenAI, Type } from '@google/genai';

async function startServer() {
  const app = express();
  const PORT = 3000;

  app.use(express.json());

  // Initialize Gemini API with correct user agent for AI Studio tracking
  const api_key = process.env.GEMINI_API_KEY;
  const ai = new GoogleGenAI({
    apiKey: api_key || '',
    httpOptions: {
      headers: {
        'User-Agent': 'aistudio-build',
      }
    }
  });

  // API Route to fetch academic citations from Gemini without exposing key
  app.post('/api/search-sources', async (req, res) => {
    try {
      const { query } = req.body;
      if (!query || typeof query !== 'string' || query.trim().length === 0) {
        res.status(400).json({ error: 'Query is required and must be a valid non-empty string' });
        return;
      }

      if (!api_key) {
        // Fallback or warning if credentials are unset
        res.status(500).json({ error: 'GEMINI_API_KEY environment variable is not defined' });
        return;
      }

      const response = await ai.models.generateContent({
        model: 'gemini-3.5-flash',
        contents: `Search for high-quality, actual published academic papers, clinical trials, or research literature matching the scientific or literary context of this quote/sentence: "${query}".
        
        Provide 3-4 professional references. Always use realistic, valid formatted DOI strings. No blank entries. Return the citations precisely conformant to the requested JSON schema.
        
        Formatting expectations:
        - harvard:
          inText: Cite Them Right Harvard bracket citation, e.g. "(Smith et al., 2021)"
          full: Full Harvard bibliography entry, e.g., "Smith, J., Jones, M. and Taylor, K. (2021) 'The Title', Nature, 592(7854), pp. 244-249. doi:10.1038/s41586-021-03491-6."
        - apa:
          inText: APA intext bracket citation, e.g. "(Smith et al., 2021)"
          full: APA bibliography bibliography entry, e.g., "Smith, J., Jones, M., & Taylor, K. (2021). The Title. Nature, 592(7854), 244-249. https://doi.org/10.1038/s41586-021-03491-6"
        - mla:
          inText: MLA intext reference, e.g. "(Smith 244)"
          full: MLA bibliography entry.
        - chicago:
          inText: Chicago intext style, e.g. "(Smith 2021)"
          full: Chicago bibliography bibliography entry.`,
        config: {
          responseMimeType: 'application/json',
          responseSchema: {
            type: Type.ARRAY,
            items: {
              type: Type.OBJECT,
              properties: {
                title: { type: Type.STRING },
                author: { type: Type.STRING },
                year: { type: Type.STRING },
                doi: { type: Type.STRING },
                citations: {
                  type: Type.OBJECT,
                  properties: {
                    harvard: {
                      type: Type.OBJECT,
                      properties: {
                        inText: { type: Type.STRING },
                        full: { type: Type.STRING }
                      },
                      required: ['inText', 'full']
                    },
                    apa: {
                      type: Type.OBJECT,
                      properties: {
                        inText: { type: Type.STRING },
                        full: { type: Type.STRING }
                      },
                      required: ['inText', 'full']
                    },
                    mla: {
                      type: Type.OBJECT,
                      properties: {
                        inText: { type: Type.STRING },
                        full: { type: Type.STRING }
                      },
                      required: ['inText', 'full']
                    },
                    chicago: {
                      type: Type.OBJECT,
                      properties: {
                        inText: { type: Type.STRING },
                        full: { type: Type.STRING }
                      },
                      required: ['inText', 'full']
                    }
                  },
                  required: ['harvard', 'apa', 'mla', 'chicago']
                }
              },
              required: ['title', 'author', 'year', 'doi', 'citations']
            }
          }
        }
      });

      const textOutput = response.text || '[]';
      res.json(JSON.parse(textOutput));
    } catch (e: any) {
      console.error('Literature search error:', e);
      res.status(500).json({ error: 'Search gateway encountered an error', details: e.message });
    }
  });

  // Handle Vite middleware integration
  if (process.env.NODE_ENV !== 'production') {
    const vite = await createViteServer({
      server: { middlewareMode: true },
      appType: 'spa',
    });
    app.use(vite.middlewares);
  } else {
    const distPath = path.join(process.cwd(), 'dist');
    app.use(express.static(distPath));
    app.get('*', (req, res) => {
      res.sendFile(path.join(distPath, 'index.html'));
    });
  }

  app.listen(PORT, '0.0.0.0', () => {
    console.log(`Node applet server configured perfectly and listening on port ${PORT}`);
  });
}

startServer();
