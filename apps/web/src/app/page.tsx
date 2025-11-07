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

function generateRoomCode(length = 6): string {
  const alphabet = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789";
  let code = "";
  for (let i = 0; i < length; i += 1) {
    code += alphabet.charAt(Math.floor(Math.random() * alphabet.length));
  }
  return code;
}

export default function Home() {
  const router = useRouter();

  const [playlists, setPlaylists] = useState<Playlist[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [selectedPlaylist, setSelectedPlaylist] = useState<Playlist | null>(null);
  const [hostNickname, setHostNickname] = useState("");
  const [hostNicknameError, setHostNicknameError] = useState<string | null>(null);
  const [roomCode, setRoomCode] = useState(generateRoomCode());

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

  useEffect(() => {
    if (!selectedPlaylist) return;
    setRoomCode(generateRoomCode());
    setHostNickname("");
    setHostNicknameError(null);
  }, [selectedPlaylist?.id]);

  const canCreateRoom = useMemo(() => {
    const trimmed = hostNickname.trim();
    return Boolean(selectedPlaylist && trimmed.length >= 2 && trimmed.length <= 16);
  }, [hostNickname, selectedPlaylist]);

  const canJoinRoom = useMemo(() => {
    const hasNickname = joinNickname.trim().length >= 2;
    const hasRoomCode = joinRoomCode.length === 6;
    return hasNickname && hasRoomCode && !joinErrors.nickname && !joinErrors.roomCode;
  }, [joinNickname, joinRoomCode, joinErrors]);

  const handleSelectPlaylist = (playlist: Playlist) => {
    setSelectedPlaylist(playlist);
  };

  const handleHostNicknameChange = (value: string) => {
    const trimmed = value.replace(/\s+/g, " ").trimStart().slice(0, 16);
    setHostNickname(trimmed);
    if (!trimmed.trim()) {
      setHostNicknameError("Enter a nickname (2-16 characters)");
    } else if (trimmed.trim().length < 2) {
      setHostNicknameError("Nickname is too short");
    } else {
      setHostNicknameError(null);
    }
  };

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

  const handleCreateRoom = () => {
    if (!selectedPlaylist) return;
    const trimmedNickname = hostNickname.replace(/\s+/g, " ").trim();
    if (trimmedNickname.length < 2 || trimmedNickname.length > 16) {
      setHostNicknameError("Nickname must be 2-16 characters");
      return;
    }

    const params = new URLSearchParams({
      nickname: trimmedNickname,
      roomcode: roomCode,
    });

    if (selectedPlaylist.name) {
      params.set("mode", selectedPlaylist.name);
    }

    router.push(`/lobby?${params.toString()}`);
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
    <main className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(99,102,241,0.15),_transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(56,189,248,0.12),_transparent_65%)]" />

      <div className="relative mx-auto flex min-h-screen w-full max-w-6xl flex-col gap-16 px-6 py-16">
        <header className="space-y-5 text-center md:text-left">
          <span className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/5 px-4 py-1 text-xs uppercase tracking-[0.35em] text-cyan-100/90">
            TempoTrivia Lobby
          </span>
          <h1 className="text-4xl font-black tracking-tight text-white drop-shadow-[0_15px_60px_rgba(56,189,248,0.4)] sm:text-5xl md:text-6xl">
            Choose a vibe and start the music showdown
          </h1>
          <p className="mx-auto max-w-2xl text-base text-cyan-100/80 md:mx-0 md:text-lg">
            Every playlist is a unique game mode curated for rapid-fire guess battles. Pick the soundtrack that fits your crew, create a room, and challenge friends in seconds.
          </p>
        </header>

        <section className="flex-1">
          {loadError && (
            <div className="mb-6 rounded-2xl border border-rose-500/40 bg-rose-500/10 p-4 text-sm text-rose-100">
              {loadError}
            </div>
          )}
          <div className="grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
            {isLoading &&
              Array.from({ length: 6 }).map((_, index) => (
                <div
                  key={`skeleton-${index}`}
                  className="h-48 animate-pulse rounded-3xl border border-white/5 bg-white/5"
                />
              ))}

            {!isLoading && playlists.length === 0 && (
              <div className="col-span-full flex flex-col items-center justify-center rounded-3xl border border-white/10 bg-white/5 px-6 py-16 text-center text-white/70">
                <span className="text-3xl">🪄</span>
                <p className="mt-4 text-lg font-semibold">No playlists yet</p>
                <p className="mt-2 max-w-sm text-sm text-white/60">
                  Check back soon—new game modes drop regularly, and your next trivia session will start here.
                </p>
              </div>
            )}

            {playlists.map((playlist) => {
              const description = playlist.description?.trim();
              return (
                <button
                  key={playlist.id ?? playlist.name}
                  type="button"
                  onClick={() => handleSelectPlaylist(playlist)}
                  className="group relative flex h-full flex-col justify-between overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-sky-900/40 p-6 text-left shadow-[0_20px_60px_rgba(15,23,42,0.6)] transition-transform hover:-translate-y-1 hover:shadow-[0_25px_70px_rgba(56,189,248,0.35)]"
                >
                  <div className="pointer-events-none absolute -top-24 right-0 h-48 w-48 rounded-full bg-cyan-500/20 blur-3xl transition-opacity group-hover:opacity-100" />
                  <div className="relative space-y-4">
                    <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100">
                      {playlist.is_default ? "Signature Mix" : "Game Mode"}
                    </span>
                    <h2 className="text-2xl font-semibold text-white">
                      {playlist.name ?? "Untitled Playlist"}
                    </h2>
                    <p className="text-sm text-cyan-100/80 line-clamp-3">
                      {description && description.length > 0
                        ? description
                        : "Curated tracks ready to test your music knowledge."}
                    </p>
                  </div>
                  <div className="relative mt-6 flex items-center justify-between text-sm font-semibold text-cyan-100/90">
                    <span className="tracking-[0.35em] uppercase">Tap to create</span>
                    <span className="text-lg transition-transform group-hover:translate-x-1">→</span>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        <section className="rounded-3xl border border-white/10 bg-white/5 p-6 shadow-[0_15px_50px_rgba(8,47,73,0.4)]">
          <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
            <div>
              <h2 className="text-xl font-semibold text-white">Join an existing room</h2>
              <p className="mt-1 text-sm text-cyan-100/70">
                Already have a six-character code? Drop it here to hop into the action.
              </p>
            </div>
            <div className="flex flex-col gap-3 sm:flex-row sm:items-center">
              <div className="w-full sm:w-48">
                <label htmlFor="joinNickname" className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100/70">
                  Nickname
                </label>
                <input
                  id="joinNickname"
                  value={joinNickname}
                  onChange={(event) => handleJoinNicknameChange(event.target.value)}
                  maxLength={16}
                  placeholder="Alex"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                />
                {joinErrors.nickname && (
                  <p className="mt-1 text-xs text-rose-200">{joinErrors.nickname}</p>
                )}
              </div>
              <div className="w-full sm:w-40">
                <label htmlFor="joinRoomCode" className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100/70">
                  Room Code
                </label>
                <input
                  id="joinRoomCode"
                  value={joinRoomCode}
                  onChange={(event) => handleJoinRoomCodeChange(event.target.value)}
                  maxLength={6}
                  placeholder="ABC123"
                  className="mt-2 w-full rounded-xl border border-white/10 bg-slate-900/80 px-4 py-3 text-sm font-semibold uppercase tracking-[0.4em] text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                />
                {joinErrors.roomCode && (
                  <p className="mt-1 text-xs text-rose-200">{joinErrors.roomCode}</p>
                )}
              </div>
              <button
                type="button"
                onClick={handleJoinRoom}
                disabled={!canJoinRoom}
                className={`flex h-12 items-center justify-center rounded-xl px-6 text-sm font-semibold uppercase tracking-[0.3em] transition-all
                  ${canJoinRoom
                    ? "bg-gradient-to-r from-cyan-500 to-blue-600 text-white shadow-[0_15px_45px_rgba(56,189,248,0.35)] hover:from-cyan-400 hover:to-blue-500"
                    : "cursor-not-allowed bg-white/10 text-white/50"}
                `}
              >
                Join
              </button>
            </div>
          </div>
        </section>
      </div>

      {selectedPlaylist && (
        <div className="fixed inset-0 z-50 flex items-center justify-center px-6 py-12">
          <button
            type="button"
            aria-label="Close create room dialog"
            className="absolute inset-0 bg-slate-950/70 backdrop-blur-sm"
            onClick={() => setSelectedPlaylist(null)}
          />
          <div className="relative z-10 w-full max-w-xl overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900 via-slate-900/90 to-cyan-950/90 p-8 shadow-[0_30px_80px_rgba(15,23,42,0.75)]">
            <button
              type="button"
              className="absolute right-4 top-4 rounded-full border border-white/10 bg-white/10 p-2 text-sm text-white transition hover:border-cyan-400 hover:bg-cyan-400/20"
              onClick={() => setSelectedPlaylist(null)}
            >
              ✕
            </button>
            <div className="space-y-6">
              <div>
                <span className="inline-flex items-center gap-2 rounded-full border border-cyan-400/30 bg-cyan-400/10 px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100">
                  {selectedPlaylist.is_default ? "Signature Mix" : "Playlist"}
                </span>
                <h2 className="mt-3 text-3xl font-bold text-white">
                  {selectedPlaylist.name ?? "Untitled Playlist"}
                </h2>
                {selectedPlaylist.description && (
                  <p className="mt-3 text-sm text-cyan-100/80">
                    {selectedPlaylist.description}
                  </p>
                )}
              </div>

              <div className="rounded-2xl border border-white/10 bg-white/5 p-4">
                <p className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100/70">Room Code</p>
                <div className="mt-3 flex items-center justify-between rounded-xl border border-white/5 bg-slate-950/60 px-4 py-3">
                  <span className="text-lg font-mono tracking-[0.4em] text-white">{roomCode}</span>
                  <button
                    type="button"
                    onClick={() => setRoomCode(generateRoomCode())}
                    className="rounded-lg border border-white/10 bg-white/10 px-3 py-2 text-xs font-semibold uppercase tracking-[0.3em] text-cyan-100 transition hover:border-cyan-400 hover:bg-cyan-400/20"
                  >
                    Refresh
                  </button>
                </div>
                <p className="mt-2 text-xs text-cyan-100/70">
                  Share this code with friends so they can join your session.
                </p>
              </div>

              <div className="space-y-3">
                <label htmlFor="hostNickname" className="text-xs font-semibold uppercase tracking-[0.35em] text-cyan-100/70">
                  Your Nickname
                </label>
                <input
                  id="hostNickname"
                  value={hostNickname}
                  onChange={(event) => handleHostNicknameChange(event.target.value)}
                  maxLength={16}
                  placeholder="DJ Tempo"
                  className="w-full rounded-xl border border-white/10 bg-slate-950/60 px-4 py-3 text-sm font-medium text-white outline-none transition focus:border-cyan-400 focus:ring-2 focus:ring-cyan-400/40"
                />
                {hostNicknameError && (
                  <p className="text-xs text-rose-200">{hostNicknameError}</p>
                )}
              </div>

              <button
                type="button"
                onClick={handleCreateRoom}
                disabled={!canCreateRoom}
                className={`flex w-full items-center justify-center gap-2 rounded-2xl px-6 py-4 text-sm font-semibold uppercase tracking-[0.3em] transition-all
                  ${canCreateRoom
                    ? "bg-gradient-to-r from-emerald-400 via-cyan-500 to-blue-600 text-white shadow-[0_20px_60px_rgba(16,185,129,0.4)] hover:from-emerald-300 hover:via-cyan-400 hover:to-blue-500"
                    : "cursor-not-allowed bg-white/10 text-white/50"}
                `}
              >
                <span className="text-lg">🚀</span>
                Create Room
              </button>
            </div>
          </div>
        </div>
      )}
    </main>
  );
}
