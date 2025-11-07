import { NextResponse } from "next/server";

type Playlist = {
  id?: string;
  name?: string;
  description?: string;
  is_default?: boolean;
};

const NORMALISE_REGEX = /\/$/;

function deriveBackendBase(): string | null {
  const direct =
    process.env.BACKEND_HTTP_URL ||
    process.env.NEXT_PUBLIC_API_URL ||
    process.env.API_BASE_URL;
  if (direct) {
    return direct.replace(NORMALISE_REGEX, "");
  }

  const wsUrl = process.env.NEXT_PUBLIC_WS_URL || process.env.WS_URL;
  if (!wsUrl) {
    return null;
  }

  try {
    const url = new URL(wsUrl);
    const protocol = url.protocol === "wss:" ? "https:" : "http:";
    url.protocol = protocol;
    url.pathname = "";
    url.search = "";
    url.hash = "";
    return url.toString().replace(NORMALISE_REGEX, "");
  } catch (error) {
    console.warn("Failed to derive backend URL from WS", error);
    return null;
  }
}

export async function GET() {
  const baseUrl = deriveBackendBase();
  if (!baseUrl) {
    return NextResponse.json(
      { error: "Backend URL is not configured", playlists: [] },
      { status: 500 }
    );
  }

  const endpoint = `${baseUrl}/playlists`;

  try {
    const res = await fetch(endpoint, { cache: "no-store" });
    if (!res.ok) {
      return NextResponse.json(
        { error: `Failed to load playlists (${res.status})`, playlists: [] },
        { status: res.status }
      );
    }

    const data = (await res.json()) as { playlists?: Playlist[] } | Playlist[];
    const playlists = Array.isArray(data)
      ? data
      : Array.isArray(data?.playlists)
      ? data.playlists
      : [];

    return NextResponse.json({ playlists });
  } catch (error) {
    console.error("Failed to fetch playlists", error);
    return NextResponse.json({ error: "Failed to reach backend", playlists: [] }, { status: 502 });
  }
}
