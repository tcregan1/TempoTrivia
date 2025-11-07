"use client";

import { useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";

type Playlist = {
  id?: string;
  name?: string;
  description?: string;
  is_default?: boolean;
};

type JoinErrors = {
  roomCode?: string;
  nickname?: string;
};

export default function Home() {
  const router = useRouter();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [joinRoomCode, setJoinRoomCode] = useState("");
  const [joinNickname, setJoinNickname] = useState("");
  const [joinErrors, setJoinErrors] = useState<JoinErrors>({});

  useEffect(() => {
    let isMounted = true;

    async function loadPlaylists() {
      try {
        setIsLoading(true);
        setLoadError(null);
        const res = await fetch("/api/playlists", { cache: "no-store" });
        if (!res.ok) {
          throw new Error(`Request failed: ${res.status}`);
        }
        const data = (await res.json()) as { playlists?: Playlist[] };
        if (!isMounted) return;
        setPlaylists(Array.isArray(data.playlists) ? data.playlists : []);
      } catch (error) {
        console.error("Failed to load playlists", error);
        if (isMounted) {
          setLoadError("We couldn't load playlists. Try refreshing the page.");
        }
      } finally {
        if (isMounted) {
          setIsLoading(false);
        }
      }
    }

    loadPlaylists();

    return () => {
      isMounted = false;
    };
  }, []);

  const canJoinRoom = useMemo(() => {
    const hasNickname = joinNickname.trim().length >= 2;
    const hasRoomCode = joinRoomCode.length === 6;
    return hasNickname && hasRoomCode && !joinErrors.nickname && !joinErrors.roomCode;
  }, [joinNickname, joinRoomCode, joinErrors]);

  const handleJoinNicknameChange = (value: string) => {
    const trimmed = value.replace(/\s+/g, " ").trimStart().slice(0, 16);
    setJoinNickname(trimmed);
    setJoinErrors((prev) => ({
      ...prev,
      nickname: trimmed.trim().length >= 2 ? undefined : "Min 2 characters",
    }));
  };

  const handleJoinRoomCodeChange = (value: string) => {
    const cleaned = value.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setJoinRoomCode(cleaned);
    setJoinErrors((prev) => ({
      ...prev,
      roomCode: cleaned.length === 6 ? undefined : "6 characters required",
    }));
  };

  const handleJoinRoom = () => {
    const trimmedNickname = joinNickname.replace(/\s+/g, " ").trim();
    const code = joinRoomCode.toUpperCase();
    const nextErrors: JoinErrors = {};

    if (trimmedNickname.length < 2) {
      nextErrors.nickname = "Min 2 characters";
    }
    if (code.length !== 6) {
      nextErrors.roomCode = "6 characters required";
    }

    if (nextErrors.nickname || nextErrors.roomCode) {
      setJoinErrors(nextErrors);
      return;
    }

    const params = new URLSearchParams({
      nickname: trimmedNickname,
      roomcode: code,
    });
    router.push(`/lobby?${params.toString()}`);
  };

  return (
    <main className="relative min-h-screen overflow-hidden bg-[#010104] text-[#f6f6f6]">
      <div className="pointer-events-none absolute inset-0">
        <div className="absolute -left-1/3 top-[-20%] h-[140%] w-[120%] rotate-6 bg-[radial-gradient(circle_at_center,_rgba(214,255,0,0.12),_transparent_60%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.12),_transparent_68%)]" />
        <div className="absolute inset-0 bg-[linear-gradient(125deg,rgba(20,15,40,0.65)_0%,rgba(5,5,16,0.6)_45%,rgba(214,255,0,0.12)_100%)]" />
        <div className="absolute inset-0 bg-[radial-gradient(circle_at_85%_110%,rgba(168,85,247,0.18),transparent_55%)] opacity-60" />
      </div>

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-16 px-6 py-16 sm:px-12">
        <header className="relative text-center">
          <div className="pointer-events-none absolute inset-0 mx-auto h-[160px] w-[min(420px,90%)] -translate-y-4 rounded-[36px] border border-white/5 bg-[linear-gradient(135deg,rgba(26,24,42,0.85),rgba(8,8,18,0.65))] shadow-[0_35px_90px_rgba(15,0,40,0.6)]" />
          <div className="pointer-events-none absolute inset-0 mx-auto h-[160px] w-[min(420px,90%)] -translate-y-4 rounded-[36px] bg-[radial-gradient(circle_at_top,rgba(168,85,247,0.35),transparent_70%)] opacity-60" />
          <h1
            className="relative inline-block px-10 pt-8 text-5xl font-black uppercase tracking-[0.42em] text-transparent drop-shadow-[0_18px_45px_rgba(45,0,80,0.8)] sm:text-6xl md:text-7xl"
            style={{ fontFamily: "var(--font-display)" }}
          >
            <span className="absolute inset-x-6 bottom-3 h-[6px] rounded-full bg-[linear-gradient(90deg,rgba(214,255,0,0.65),rgba(168,85,247,0.75),rgba(214,255,0,0.6))] opacity-70" />
            <span className="relative bg-[linear-gradient(110deg,#d6ff00_0%,#d6ff00_34%,#a855f7_62%,#60ffe8_100%)] bg-clip-text">
              Tempo Trivia
            </span>
          </h1>
          <p className="mx-auto mt-6 max-w-2xl text-sm uppercase tracking-[0.4em] text-[#f6f6f6]/60">
            Choose a playlist, or jump into an active match.
          </p>
        </header>

        <section className="flex-1">
          {loadError && (
            <div className="mb-6 rounded-3xl border border-[#ff4b91]/40 bg-[#ff4b91]/10 px-5 py-4 text-sm text-[#ffd7eb]">
              {loadError}
            </div>
          )}

          <div className="grid gap-6 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading &&
              Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="h-44 animate-pulse rounded-3xl border border-white/10 bg-white/5"
                />
              ))}

            {!isLoading && playlists.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-6 py-16 text-center text-white/80">
                <span className="text-3xl">🛰️</span>
                <p className="mt-4 text-lg font-semibold uppercase tracking-[0.4em] text-[#d6ff00]">No playlists yet</p>
                <p className="mt-2 max-w-sm text-sm text-white/70">
                  Check back soon—fresh soundscapes are on their way.
                </p>
              </div>
            )}

            {playlists.map((playlist) => {
              const description = playlist.description?.trim();
              return (
                <article
                  key={playlist.id ?? playlist.name}
                  className="group relative flex h-full flex-col overflow-hidden rounded-3xl border border-white/12 bg-[#080808]/80 p-6 text-left shadow-[0_22px_60px_rgba(0,0,0,0.45)] transition-transform duration-300 hover:-translate-y-1 hover:border-[#d6ff00]/60"
                >
                  <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,255,0,0.16),_transparent_58%)] opacity-60 transition-opacity duration-300 group-hover:opacity-90" />
                  <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.05)_0%,transparent_45%,rgba(214,255,0,0.15)_100%)] opacity-0 transition-opacity duration-300 group-hover:opacity-100" />
                  <div className="relative flex flex-1 flex-col justify-between gap-6">
                    <div className="space-y-3">
                      <h2
                        className="text-2xl font-bold uppercase tracking-[0.35em] text-white"
                        style={{ fontFamily: "var(--font-display)" }}
                      >
                        {playlist.name ?? "Untitled Playlist"}
                      </h2>
                      {description && description.length > 0 ? (
                        <p className="text-xs uppercase tracking-[0.35em] text-white/60">{description}</p>
                      ) : (
                        <p className="text-xs uppercase tracking-[0.35em] text-white/35">Awaiting tracklist</p>
                      )}
                    </div>
                    <span className="text-right text-xs font-semibold uppercase tracking-[0.45em] text-[#d6ff00]">
                      Ready
                    </span>
                  </div>
                </article>
              );
            })}
          </div>
        </section>

        <section className="relative overflow-hidden rounded-[28px] border border-white/12 bg-[#0b0b0b]/85 p-8 shadow-[0_30px_80px_rgba(0,0,0,0.55)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(214,255,0,0.18),_transparent_62%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.05)_0%,transparent_45%,rgba(214,255,0,0.1)_100%)]" />
          <div className="relative flex flex-col gap-6 md:flex-row md:items-end md:justify-between">
            <div className="space-y-2">
              <h2
                className="text-2xl font-bold uppercase tracking-[0.45em] text-[#d6ff00]"
                style={{ fontFamily: "var(--font-display)" }}
              >
                Join game in progress
              </h2>
              <p className="text-xs uppercase tracking-[0.35em] text-white/60">
                Enter your codename and room code to sync with the live round.
              </p>
            </div>
            <div className="flex flex-col gap-4 sm:flex-row sm:items-end">
              <div className="w-full sm:w-48">
                <label htmlFor="joinNickname" className="text-[11px] font-semibold uppercase tracking-[0.45em] text-white/65">
                  Codename
                </label>
                <input
                  id="joinNickname"
                  value={joinNickname}
                  onChange={(event) => handleJoinNicknameChange(event.target.value)}
                  maxLength={16}
                  placeholder="ECHO"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-medium uppercase tracking-[0.3em] text-white outline-none transition focus:border-[#d6ff00]/80 focus:ring-2 focus:ring-[#d6ff00]/30"
                />
                {joinErrors.nickname && (
                  <p className="mt-1 text-xs text-[#ffb3c6]">{joinErrors.nickname}</p>
                )}
              </div>
              <div className="w-full sm:w-40">
                <label htmlFor="joinRoomCode" className="text-[11px] font-semibold uppercase tracking-[0.45em] text-white/65">
                  Room code
                </label>
                <input
                  id="joinRoomCode"
                  value={joinRoomCode}
                  onChange={(event) => handleJoinRoomCodeChange(event.target.value)}
                  maxLength={6}
                  placeholder="ZX8KQ4"
                  className="mt-2 w-full rounded-xl border border-white/15 bg-black/70 px-4 py-3 text-sm font-semibold uppercase tracking-[0.55em] text-white outline-none transition focus:border-[#d6ff00]/80 focus:ring-2 focus:ring-[#d6ff00]/30"
                />
                {joinErrors.roomCode && (
                  <p className="mt-1 text-xs text-[#ffb3c6]">{joinErrors.roomCode}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleJoinRoom}
                disabled={!canJoinRoom}
                className={`relative flex h-14 items-center justify-center overflow-hidden rounded-xl px-8 text-xs font-semibold uppercase tracking-[0.45em] transition-all duration-300
                  ${canJoinRoom
                    ? "bg-[#d6ff00] text-black shadow-[0_0_35px_rgba(214,255,0,0.45)] hover:shadow-[0_0_45px_rgba(214,255,0,0.6)]"
                    : "cursor-not-allowed border border-white/15 bg-black/50 text-white/45"}
                `}
              >
                Join
              </button>
            </div>
          </div>
        </section>
      </div>
    </main>
  );
}
