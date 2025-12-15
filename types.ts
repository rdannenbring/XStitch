export interface CapturedItem {
  id: string;
  timestamp: number;
  html: string;
  image: string | null;
  sourceUrl: string;
  title?: string;
  initialTab?: 'design' | 'code';
}

export interface StitchExportPayload {
  html: string;
  image: string | null;
  sourceUrl: string;
  title?: string;
}
