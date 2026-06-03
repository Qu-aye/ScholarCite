export interface Source {
  title: string;
  author: string;
  year: string;
  doi: string;
  citations?: {
    harvard: {
      inText: string;
      full: string;
    };
    apa: {
      inText: string;
      full: string;
    };
    mla: {
      inText: string;
      full: string;
    };
    chicago: {
      inText: string;
      full: string;
    };
  };
}

export async function searchSources(query: string): Promise<Source[]> {
  const response = await fetch('/api/search-sources', {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({ query }),
  });

  if (!response.ok) {
    const err = await response.json().catch(() => ({}));
    throw new Error(err.error || 'Failed to search academic literature indexes');
  }

  return response.json();
}
