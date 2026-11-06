import { NextRequest, NextResponse } from "next/server";
import { ensureSchema, dbQuery } from "@/db/schema";

export async function GET(request: NextRequest) {
  await ensureSchema();
  const locale = request.nextUrl.searchParams.get("locale") || "tr";
  const news = await dbQuery(
    `SELECT slug, category, published_at, title, summary
     FROM cms_news
     WHERE status = 'published'
     ORDER BY published_at DESC LIMIT 20`
  );
  const videos = await dbQuery(
    `SELECT slug, youtube_id, duration, published_at, title, summary
     FROM cms_videos
     WHERE status = 'published'
     ORDER BY published_at DESC LIMIT 20`
  );

  return NextResponse.json({
    apiVersion: "v1",
    locale,
    news: news.rows,
    videos: videos.rows
  });
}
