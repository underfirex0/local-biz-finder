
export interface BusinessInfo {
  name: string;
  phone: string;
  reviews: string;
  address?: string;
}

export type LeadStatus = 'New' | 'Called - No Answer' | 'Contacted' | 'Meeting Booked' | 'Not Interested';

export interface Lead extends BusinessInfo {
  id: string;
  status: LeadStatus;
  savedAt: number;
  category: string; // The service type (e.g., "Plumbing")
  script?: string;
  lastNiche?: string;
}

export interface GroundingSource {
  title: string;
  uri: string;
}

export interface SearchResult {
  businesses: BusinessInfo[];
  sources: GroundingSource[];
  rawMarkdown: string;
}

export interface SearchParams {
  service: string;
  city: string;
  count: number;
}

export type MarketingNiche = 'Web Design' | 'Social Media' | 'Google Ads' | 'SEO' | 'General Marketing';
