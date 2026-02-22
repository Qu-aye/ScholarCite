export interface Source {
  id?: string;
  title: string;
  author: string;
  year: string;
  publication: string;
  snippet: string;
  url: string;
  doi?: string;
  dateAdded?: string;
}

export interface CitationResult {
  inText: string;
  bibliography: string;
}

export interface BibliographyEntry {
  id: string;
  text: string;
  source: Source;
}

export enum CitationStyle {
  HARVARD = "Cite Them Right Harvard",
  APA = "APA (7th Edition)",
  MLA = "MLA (9th Edition)",
  CHICAGO = "Chicago",
  VANCOUVER = "Vancouver",
  IEEE = "IEEE"
}

export interface SearchState {
  isSearching: boolean;
  results: {
    suggested: Source[];
    related: Source[];
  };
  error: string | null;
}
