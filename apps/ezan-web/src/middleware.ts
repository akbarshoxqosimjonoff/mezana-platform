import { NextRequest, NextResponse } from "next/server";
import { isValidLocale, Locale } from "./i18n/country-locale";
import { EZAN_LANG_COOKIE, resolveRequestLocale, stripWww } from "./i18n/hosts";

export interface MiddlewareDecision {
  action: "redirect" | "pass";
  status?: 301 | 307;
  location?: string;
  locale?: Locale;
  cacheControl?: string;
}

export const LEGACY_301_REDIRECTS: Record<string, string> = {
  "/tr/faaliyetler/istanbul-ogrenci-yurdu": "/tr/faaliyetler/talebe-yurdu",
  "/uz/faoliyatlar/istanbul-ogrenci-yurdu": "/uz/faoliyatlar/talebe-yurdu",
  "/en/projects/istanbul-ogrenci-yurdu": "/en/projects/talebe-yurdu",
  "/ar/projects/istanbul-ogrenci-yurdu": "/ar/projects/talebe-yurdu",
  "/tr/faaliyetler/turkistan-egitim-merkezi": "/tr/faaliyetler/mezana-akademisi",
  "/uz/faoliyatlar/turkistan-egitim-merkezi": "/uz/faoliyatlar/mezana-akademisi",
  "/en/projects/turkistan-egitim-merkezi": "/en/projects/mezana-akademisi",
  "/ar/projects/turkistan-egitim-merkezi": "/ar/projects/mezana-akademisi",
  "/tr/faaliyetler/dijital-kutuphane": "/tr/faaliyetler/yayincilik",
  "/uz/faoliyatlar/dijital-kutuphane": "/uz/faoliyatlar/yayincilik",
  "/en/projects/dijital-kutuphane": "/en/projects/yayincilik",
  "/ar/projects/dijital-kutuphane": "/ar/projects/yayincilik",
  "/hakkimizda.html": "/tr/hakkimizda",
  "/bagis.html": "/tr/bagis",
  "/bagis.php": "/tr/bagis",
  "/iletisim.html": "/tr/iletisim"
};

export function evaluateLocaleRouting(params: {
  pathname: string;
  search?: string;
  host?: string | null;
  cookieLang?: string | null;
  cfCountry?: string | null;
  acceptLanguage?: string | null;
  userAgent?: string | null;
  protocol?: string;
}): MiddlewareDecision {
  const pathname = params.pathname || "/";
  const search = params.search || "";
  const rawHost = params.host || "ezanvakfi.org";
  const { cleanHost, hadWww } = stripWww(rawHost);

  // Legacy va 1-bosqich namunaviy loyihalardan yangi katalog sluglariga 301 redirect
  const legacyTarget = LEGACY_301_REDIRECTS[pathname];
  if (legacyTarget) {
    return {
      action: "redirect",
      status: 301,
      location: `${legacyTarget}${search}`
    };
  }

  // Skip static assets, API, and admin routes
  if (
    pathname.startsWith("/_next") ||
    pathname.startsWith("/api") ||
    pathname.startsWith("/admin") ||
    pathname.startsWith("/dala") ||
    pathname === "/robots.txt" ||
    pathname === "/sitemap.xml" ||
    pathname === "/favicon.ico" ||
    /\.[a-zA-Z0-9]+$/.test(pathname)
  ) {
    return { action: "pass" };
  }

  // www -> non-www 301 redirect
  if (hadWww) {
    const proto = params.protocol || "https";
    return {
      action: "redirect",
      status: 301,
      location: `${proto}://${cleanHost}${pathname}${search}`
    };
  }

  // Check if URL already has a valid locale prefix (/tr, /uz, /en, /ar)
  const segments = pathname.split("/").filter(Boolean);
  const firstSegment = segments[0];

  if (isValidLocale(firstSegment)) {
    // Prefiksi bor URL hech qachon avtomatik boshqa tilga redirect qilinmaydi
    return {
      action: "pass",
      locale: firstSegment
    };
  }

  // Til prefiksi yo'q so'rovlar uchun tilni aniqlash
  const targetLocale = resolveRequestLocale({
    host: cleanHost,
    cookieLang: params.cookieLang,
    cfCountry: params.cfCountry,
    acceptLanguage: params.acceptLanguage,
    userAgent: params.userAgent
  });

  const normalizedSuffix = pathname === "/" ? "" : pathname.startsWith("/") ? pathname : `/${pathname}`;
  const targetLocation = `/${targetLocale}${normalizedSuffix}${search}`;

  return {
    action: "redirect",
    status: 307,
    location: targetLocation,
    locale: targetLocale,
    cacheControl: "private, no-store"
  };
}

export function middleware(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const host = request.headers.get("x-forwarded-host") || request.headers.get("host");
  const proto = request.headers.get("x-forwarded-proto") || "https";
  const cookieLang = request.cookies.get(EZAN_LANG_COOKIE)?.value || null;
  const cfCountry = request.headers.get("cf-ipcountry");
  const acceptLanguage = request.headers.get("accept-language");
  const userAgent = request.headers.get("user-agent");

  const decision = evaluateLocaleRouting({
    pathname,
    search,
    host,
    cookieLang,
    cfCountry,
    acceptLanguage,
    userAgent,
    protocol: proto
  });

  if (decision.action === "redirect" && decision.location) {
    const targetUrl = decision.location.startsWith("http")
      ? new URL(decision.location)
      : new URL(decision.location, request.url);
    const response = NextResponse.redirect(targetUrl, { status: decision.status || 307 });
    if (decision.cacheControl) {
      response.headers.set("Cache-Control", decision.cacheControl);
    }
    return response;
  }

  const response = NextResponse.next();
  if (decision.locale) {
    response.headers.set("x-ezan-locale", decision.locale);
  }
  return response;
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico).*)"]
};
