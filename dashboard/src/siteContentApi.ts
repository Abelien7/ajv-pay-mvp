import type { ListItem, NewsPost } from './types';

const API_BASE_URL = import.meta.env.VITE_API_BASE_URL ?? 'http://localhost:3000';

/** Lecture publique du contenu du site vitrine — pas d'authentification (voir SiteContentPublicController, backend). */
export const siteContentApi = {
  async listNews(): Promise<NewsPost[]> {
    const res = await fetch(`${API_BASE_URL}/site-content/news`);
    if (!res.ok) return [];
    return res.json();
  },
  async listCountries(): Promise<ListItem[]> {
    const res = await fetch(`${API_BASE_URL}/site-content/countries`);
    if (!res.ok) return [];
    return res.json();
  },
  async listNetworks(): Promise<ListItem[]> {
    const res = await fetch(`${API_BASE_URL}/site-content/networks`);
    if (!res.ok) return [];
    return res.json();
  },
};
