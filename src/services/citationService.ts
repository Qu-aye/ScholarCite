import axios from 'axios';
import Cite from 'citation-js';

export async function generateCitation(doi: string, style: string = 'apa'): Promise<string> {
  try {
    // 1. Fetch metadata from CrossRef
    const response = await axios.get(`https://api.crossref.org/works/${doi}`);
    const metadata = response.data.message;

    // 2. Use citation-js to format
    const cite = new Cite(metadata);
    
    // 3. Format as bibliography
    const citation = cite.format('bibliography', {
      format: 'text',
      template: style,
      lang: 'en-US'
    });

    return citation;
  } catch (error) {
    console.error('Error generating citation:', error);
    throw new Error('Could not generate citation. Please check the DOI.');
  }
}
