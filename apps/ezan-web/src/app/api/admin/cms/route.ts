import { NextRequest, NextResponse } from "next/server";
import { dbQuery, ensureSchema } from "../../../../db/schema";
import { canAccessAdminCms, getAuthenticatedAdminSession } from "../../../../lib/security";
import {
  PAYLOAD_COLLECTIONS,
  updateKurbanCountryByAdmin,
  updateKurbanSeasonByAdmin,
  upsertCmsCampaignByAdmin,
  upsertKurbanOfferByAdmin
} from "../../../../cms/service";

export async function GET(req: NextRequest) {
  await ensureSchema();
  const cookie = req.cookies.get("ezan_admin_session")?.value;
  const session = await getAuthenticatedAdminSession(cookie);
  if (!session || !session.totpVerified) {
    return NextResponse.json({ error: "Unauthorized: 2FA session required" }, { status: 401 });
  }
  if (!canAccessAdminCms(session.role)) {
    return NextResponse.json({ error: "Forbidden: Field role cannot access Admin CMS" }, { status: 403 });
  }

  const [seasons, countries, offers, campaigns, auditLogs] = await Promise.all([
    dbQuery("SELECT * FROM kurban_seasons ORDER BY year DESC"),
    dbQuery("SELECT * FROM kurban_countries ORDER BY id ASC"),
    dbQuery("SELECT * FROM kurban_offers ORDER BY season_year DESC, country_code ASC, animal_type ASC"),
    dbQuery("SELECT * FROM cms_campaigns ORDER BY id ASC"),
    dbQuery("SELECT * FROM admin_audit_logs ORDER BY id DESC LIMIT 30")
  ]);

  return NextResponse.json({
    user: session,
    collections: PAYLOAD_COLLECTIONS,
    kurbanSeasons: seasons.rows,
    kurbanCountries: countries.rows,
    kurbanOffers: offers.rows,
    campaigns: campaigns.rows,
    auditLogs: auditLogs.rows
  });
}

export async function POST(req: NextRequest) {
  await ensureSchema();
  const cookie = req.cookies.get("ezan_admin_session")?.value;
  const session = await getAuthenticatedAdminSession(cookie);
  if (!session || !session.totpVerified) {
    return NextResponse.json({ error: "Unauthorized: 2FA session required" }, { status: 401 });
  }
  if (!canAccessAdminCms(session.role)) {
    return NextResponse.json({ error: "Forbidden: Field role cannot access Admin CMS" }, { status: 403 });
  }

  try {
    const body = await req.json();
    const actor = {
      userId: session.userId,
      email: session.email,
      role: session.role,
      totpVerified: session.totpVerified,
      clientIp: req.headers.get("cf-connecting-ip") || "127.0.0.1"
    };

    if (body.action === "update_kurban_season") {
      const updated = await updateKurbanSeasonByAdmin(actor, body.data);
      return NextResponse.json({ ok: true, season: updated });
    }
    if (body.action === "update_kurban_country") {
      const updated = await updateKurbanCountryByAdmin(actor, body.data);
      return NextResponse.json({ ok: true, country: updated });
    }
    if (body.action === "upsert_kurban_offer") {
      const updated = await upsertKurbanOfferByAdmin(actor, body.data);
      return NextResponse.json({ ok: true, offer: updated });
    }
    if (body.action === "upsert_campaign") {
      const updated = await upsertCmsCampaignByAdmin(actor, body.data);
      return NextResponse.json({ ok: true, campaign: updated });
    }

    return NextResponse.json({ error: "Unknown CMS action" }, { status: 400 });
  } catch (err: any) {
    return NextResponse.json({ error: err?.message || "CMS operation failed" }, { status: err?.statusCode || 400 });
  }
}
