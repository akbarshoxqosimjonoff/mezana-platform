export function readBotEnvKey(key: string, fallback?: string): string;
export const VAQF_BFF_BASE: string;
export const VAQF_PUBLIC_WEB_URL: string;
export const VAQF_BOT_SECRET: string;
export const VAQF_BOT_USERNAME: string;
export function maskSecretToken(token: string | undefined | null): string;
export function escapeHtml(str: any): string;
export function callVaqfBff(
  telegramId: string,
  path: string,
  options?: { method?: string; body?: any }
): Promise<{ ok: boolean; status: number; data: any }>;
export function checkUserVaqfAccess(
  telegramId: string,
  forceRefresh?: boolean
): Promise<{
  hasAccess: boolean;
  isDirector: boolean;
  canEdit: boolean;
  role: string;
  user: any;
  expiresAt: number;
}>;
export function formatAssetCardHtml(a: any, lang?: string): string;
