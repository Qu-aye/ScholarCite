import axios from 'axios';
import Cite from 'citation-js';

function formatCrossRefAuthors(authorList: any[] | undefined): string {
  if (!authorList || authorList.length === 0) return 'Unknown Author';
  
  const formatted = authorList.map(a => {
    const family = a.family || '';
    const given = a.given || '';
    
    if (!family) return given;
    if (!given) return family;
    
    const initials = given
      .split(/[\s.-]+/)
      .filter(Boolean)
      .map(part => part[0].toUpperCase() + '.')
      .join('');
      
    return `${family}, ${initials}`;
  });
  
  if (formatted.length === 1) {
    return formatted[0];
  }
  if (formatted.length === 2) {
    return `${formatted[0]} and ${formatted[1]}`;
  }
  return `${formatted.slice(0, -1).join(', ')} and ${formatted[formatted.length - 1]}`;
}

function extractYear(metadata: any): string {
  if (metadata.issued && metadata.issued['date-parts'] && metadata.issued['date-parts'][0]) {
    return metadata.issued['date-parts'][0][0]?.toString() || 'n.d.';
  }
  if (metadata.created && metadata.created['date-parts'] && metadata.created['date-parts'][0]) {
    return metadata.created['date-parts'][0][0]?.toString() || 'n.d.';
  }
  if (metadata.published && metadata.published['date-parts'] && metadata.published['date-parts'][0]) {
    return metadata.published['date-parts'][0][0]?.toString() || 'n.d.';
  }
  return 'n.d.';
}

export async function generateCitation(doi: string, style: string = 'apa'): Promise<string> {
  try {
    // 1. Fetch metadata from CrossRef
    const response = await axios.get(`https://api.crossref.org/works/${doi}`);
    const metadata = response.data.message;

    // Use customized high-fidelity outputs for Harvard (Cite Them Right 12th edition) and APA
    const normalizedStyle = style.toLowerCase();
    if (normalizedStyle === 'harvard' || normalizedStyle === 'apa') {
      const year = extractYear(metadata);
      const title = metadata.title ? metadata.title[0] : 'Untitled Work';
      const journal = metadata['container-title'] ? metadata['container-title'][0] : '';
      const volume = metadata.volume || '';
      const issue = metadata.issue || '';
      const pages = metadata.page || '';
      const rawDoi = metadata.DOI || metadata.doi || doi;
      const cleanDoi = rawDoi.startsWith('https://doi.org/') ? rawDoi.replace('https://doi.org/', '') : rawDoi;

      if (normalizedStyle === 'harvard') {
        const harvardAuthorsString = formatCrossRefAuthors(metadata.author);
        let harvardFull = `${harvardAuthorsString} (${year}) '${title}'`;
        if (journal) {
          harvardFull += `, *${journal}*`;
        }
        if (volume) {
          harvardFull += `, ${volume}`;
          if (issue) {
            harvardFull += `(${issue})`;
          }
        } else if (issue) {
          harvardFull += `, (${issue})`;
        }
        if (pages) {
          harvardFull += `, pp. ${pages}`;
        }
        if (cleanDoi) {
          harvardFull += `. https://doi.org/${cleanDoi}`;
        } else {
          harvardFull += '.';
        }
        return harvardFull;
      } else {
        // APA Style 7th Edition
        const apaAuthors = (metadata.author || []).map((a: any) => {
          const family = a.family || '';
          const given = a.given || '';
          if (!family) return given;
          if (!given) return family;
          const initials = given.split(/[\s.-]+/).filter(Boolean).map(p => p[0].toUpperCase() + '.').join(' ');
          return `${family}, ${initials}`;
        });
        let apaAuthorsStr = '';
        if (apaAuthors.length === 1) {
          apaAuthorsStr = apaAuthors[0];
        } else if (apaAuthors.length === 2) {
          apaAuthorsStr = `${apaAuthors[0]} & ${apaAuthors[1]}`;
        } else if (apaAuthors.length > 2) {
          apaAuthorsStr = `${apaAuthors.slice(0, -1).join(', ')}, & ${apaAuthors[apaAuthors.length - 1]}`;
        } else {
          apaAuthorsStr = 'Unknown Author';
        }
        
        let apaFull = `${apaAuthorsStr} (${year}). ${title}`;
        if (journal) {
          apaFull += `. *${journal}*`;
        }
        if (volume) {
          apaFull += `, *${volume}*`;
          if (issue) {
            apaFull += `(${issue})`;
          }
        }
        if (pages) {
          apaFull += `, ${pages}`;
        }
        if (cleanDoi) {
          apaFull += `. https://doi.org/${cleanDoi}`;
        } else {
          apaFull += '.';
        }
        return apaFull;
      }
    }

    // 2. Use citation-js to format for style fallbacks like Chicago or Vancouver
    const cite = new Cite(metadata);
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
