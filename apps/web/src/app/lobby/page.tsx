"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

// ---- Types ----
interface Player {
  id: string;
  name: string;
  score: number;
}

interface LeaderboardPlayer {
  name: string;
  score: number;
}

type GameState = "lobby" | "playing" | "leaderboard" | "ended";

interface LobbyViewProps {
  players: Player[];
  roomCode: string;
  onStart: () => void;
  myPlayerId: string;
  hostId: string;
  gameModes: string[];
  selectedMode: string;
  onSelectMode: (modeName: string) => void;
  hostOnlyAudio: boolean;
  onAudioModeToggle: (hostOnly: boolean) => void;
}

interface AnswerResultPayload {
  artistCorrect: boolean;
  titleCorrect: boolean;
  bothCorrect: boolean;
  scoreAwarded: number;
  artistGuess: string;
  titleGuess: string;
}

interface PlayingViewProps {
  songUrl: string;
  timeRemaining: number;
  onSubmitAnswer: (artist: string, title: string) => void;
  reveal?: { title: string; artist: string; artistImageUrl?: string | null } | null;
  answerResult: AnswerResultPayload | null;
}

interface LeaderboardViewProps {
  leaderboard: LeaderboardPlayer[];
  currentRound: number;
  totalRounds: number;
  isHost: boolean;
  onNextRound: () => void;
}

interface ResultsViewProps {
  leaderboard: LeaderboardPlayer[];
}

// ---- Shared Layout Component ----
function GameLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="relative min-h-screen overflow-hidden bg-slate-950 text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.25),_transparent_60%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(14,165,233,0.18),_transparent_65%)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-fuchsia-500/30 to-transparent" />
      <div className="relative mx-auto max-w-5xl px-6 py-10">
        <div className="rounded-[32px] border border-white/10 bg-white/5 bg-clip-padding p-8 backdrop-blur-xl shadow-[0_20px_70px_rgba(15,23,42,0.75)]">
          {children}
        </div>
      </div>
    </div>
  );
}

// ---- Main Game Client ----
export default function GameClient() {
  const [gameState, setGameState] = useState<GameState>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const [songData, setSongData] = useState<{ url: string; title: string; artist: string }>({ url: "", title: "", artist: "" });
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [totalRounds, setTotalRounds] = useState<number>(10);
  const params = useSearchParams();
  const rc = params.get("roomcode") ?? "";
  const alias = params.get("nickname") ?? "";
  const [hostId, setHostId] = useState<string>("");
  const [myPlayerId, setMyPlayerId] = useState<string>("")
  const [gameModes, setGameModes] = useState<string[]>([])
  const [modeDescriptions, setDescriptions] = useState<string[]>([])
  const [selectedGameMode, setSelectedGameMode] = useState<string>("");
  const [hostOnlyAudio, setHostOnlyAudio] = useState(false);
  const [isHostAudioMode, setIsHostAudioMode] = useState(false);
  const [reveal, setReveal] = useState<{ title: string; artist: string; artistImageUrl?: string | null } | null>(null);
  const [answerResult, setAnswerResult] = useState<AnswerResultPayload | null>(null);


  useEffect(() => {
    if (!rc || !alias) return;

    const wsUrl = `${process.env.NEXT_PUBLIC_WS_URL}/ws`;
    const ws = new WebSocket(wsUrl);
    socketRef.current = ws;

    ws.onopen = () => {
      ws.send(
        JSON.stringify({
          type: "join",
          payload: { roomCode: rc, nickname: alias },
        })
      );
    };

    ws.onmessage = (evt) => {
      console.log(" Received:", evt.data)
      try {
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
          case "joined": {
            setMyPlayerId(msg.payload?.playerId || "");
            setHostId(msg.payload?.hostId || "");
            console.log("Joined! I am:", msg.payload?.playerId);
            console.log("👑 Host is:", msg.payload?.hostId);
            break;
          }
          case "game_modes": {
            console.log("Received Game_modes")
            setGameModes(msg.payload?.name || []);
            setDescriptions(msg.payload?.description || []);
            break; 
          }
          case "game_state_changed": {
            console.log("Game state changed")
            const next = msg.payload?.newState as GameState | undefined;
            if (next) setGameState(next);
            break;
          }
          case "room_state": {
            setPlayers(msg.payload?.players ?? []);
            setHostId(msg.payload?.hostId || "")
            setSelectedGameMode(msg.payload?.selectedMode || "")
            break;
          }
          case "round_started": {
            const sd = msg.payload?.songData ?? { url: "", title: "", artist: "" };
            setSongData(sd);
            setTimeRemaining(msg.payload?.duration ?? 30);
            setIsHostAudioMode(msg.payload?.isHost === false);
            setGameState("playing");
            setReveal(null);
            setAnswerResult(null);
            break;
          }
          case "mode_selected": {
            console.log("Received Mode Selection Update");
            setDescriptions([]);
            setSelectedGameMode(msg.payload?.selectedMode || "");
            break;
          }
          case "round_ended": {
            setReveal(null);
            setAnswerResult(null);
            setLeaderboard(msg.payload?.leaderboard ?? []);
            setCurrentRound(msg.payload?.currentRound ?? 0);
            setTotalRounds(msg.payload?.totalRounds ?? 10);
            setGameState("leaderboard");
            break;
          }
          case "game_ended": {
            setLeaderboard(msg.payload?.finalLeaderboard ?? []);
            setGameState("ended");
            break;
          }
          case "audio_mode_set": {
            const hostOnly = msg.payload?.hostOnlyAudio ?? false;
            setHostOnlyAudio(hostOnly);
            console.log("Audio mode set to:", hostOnly ? "host-only" : "everyone");
            break;
          }
          case "answer_reveal": {
            const p = msg.payload;
            setReveal({ title: p.title, artist: p.artist, artistImageUrl: p.artistImageUrl });
            break;
          }
          case "answer_received": {
            const payload = msg.payload ?? {};
            const result = payload.result ?? {};
            setAnswerResult({
              artistCorrect: Boolean(result.artist_correct),
              titleCorrect: Boolean(result.title_correct),
              bothCorrect: Boolean(result.both_correct),
              scoreAwarded: typeof payload.scoreAwarded === "number" ? payload.scoreAwarded : 0,
              artistGuess: payload.artist ?? "",
              titleGuess: payload.title ?? "",
            });
            break;
          }
          default:
            break;
        }
      } catch (e) {
        console.error("Failed to parse WS message", e);
      }
    };

    ws.onerror = (e) => {
      console.error("WS error:", e);
    };

    ws.onclose = (e) => {
      console.log("WS closed", e.code, e.reason);
    };

    return () => {
      ws.close();
    };
  }, [rc, alias]);

  const handleSelectMode = (modeName: string) => {
    send("select_game_mode", { roomCode: rc, mode: modeName });
  };
  const handleAudioModeToggle = (hostOnly: boolean) => {
  setHostOnlyAudio(hostOnly);
  send("set_audio_mode", { hostOnly });
  };

  useEffect(() => {
    if (gameState !== "playing") return;
    const id = setInterval(() => {
      setTimeRemaining((t) => (t > 0 ? t - 1 : 0));
    }, 1000);
    return () => clearInterval(id);
  }, [gameState]);

  const send = (type: string, payload: unknown) => {
    const ws = socketRef.current;
    if (!ws || ws.readyState !== WebSocket.OPEN) return;
    console.log(" Sending:", type, payload)
    ws.send(JSON.stringify({ type, payload }));
  };

  const handleStartGame = () => {
    if(!selectedGameMode){
      console.warn("Cannot start game: No mode selected: ")
      return
    }
    send("start_game", {
      roomCode: rc,
      players: players,
      gameMode: selectedGameMode
    })
    console.log("Start game clicked! ")
    console.log("Sending to room: ", rc)
    console.log("Players: ", players)
    console.log("Selected Game Mode: ", selectedGameMode)
  };

  const handleSubmitAnswer = (artist: string, title: string) => {
    send("submit_answer", { artist, title });
  };

  const handleNextRound = () => {
    send("next_round", {});
  };

  return (
    <GameLayout>
      {gameState === "lobby" && (
        <LobbyView 
          players={players} 
          roomCode={rc} 
          onStart={handleStartGame} 
          myPlayerId={myPlayerId} 
          hostId={hostId} 
          gameModes={gameModes} 
          selectedMode={selectedGameMode} 
          onSelectMode={handleSelectMode} 
          hostOnlyAudio={hostOnlyAudio}
          onAudioModeToggle={handleAudioModeToggle}
        />
      )}
      {gameState === "playing" && (
        <PlayingView
          songUrl={songData.url}
          timeRemaining={timeRemaining}
          onSubmitAnswer={handleSubmitAnswer}
          reveal={reveal}
          answerResult={answerResult}
        />
      )}
      {gameState === "leaderboard" && (
        <LeaderboardView 
          leaderboard={leaderboard} 
          currentRound={currentRound}
          totalRounds={totalRounds}
          isHost={myPlayerId === hostId}
          onNextRound={handleNextRound}
        />
      )}
      {gameState === "ended" && (
        <FinalResultsView leaderboard={leaderboard} />
      )}
    </GameLayout>
  );
}

function LobbyView({ 
  players, 
  roomCode, 
  onStart, 
  myPlayerId, 
  hostId, 
  gameModes, 
  selectedMode, 
  onSelectMode,
  hostOnlyAudio,
  onAudioModeToggle
}: LobbyViewProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isHost = myPlayerId === hostId;
  const canStartGame = players.length > 0 && selectedMode !== "";

  const handleModeSelection = (modeName: string) => {
    if (isHost) {
      onSelectMode(modeName);
      setIsDropdownOpen(false);
    }
  };
  
  const toggleDropdown = () => {
    if (isHost) setIsDropdownOpen(prev => !prev);
  };

  return (
    <div className="space-y-12">
      <div className="flex flex-wrap items-center justify-between gap-4">
        <div>
          <p className="text-sm uppercase tracking-[0.45em] text-cyan-200/70">Tempo Trivia</p>
          <h1 className="mt-2 text-5xl font-black text-white drop-shadow-[0_8px_40px_rgba(56,189,248,0.35)]">
            Lobby Control Center
          </h1>
        </div>
        <span className="rounded-full border border-cyan-500/50 bg-cyan-500/10 px-6 py-2 text-sm font-semibold uppercase tracking-wider text-cyan-200">
          Room Code · {roomCode}
        </span>
      </div>

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-indigo-900/40 p-6 shadow-[0_20px_60px_rgba(15,23,42,0.6)]">
            <div className="pointer-events-none absolute -top-32 right-10 h-64 w-64 rounded-full bg-cyan-500/20 blur-3xl" />
            <div className="relative">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-semibold text-white">Players</h2>
                <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-cyan-100">
                  {players.length} joined
                </span>
              </div>
              <div className="space-y-3">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="group flex items-center justify-between rounded-2xl border border-white/5 bg-white/5 px-5 py-4 text-white shadow-[0_10px_30px_rgba(14,165,233,0.25)] transition-all hover:border-cyan-400/60 hover:bg-cyan-400/10"
                  >
                    <div className="flex items-center gap-3">
                      <div className="flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-600 font-semibold">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <p className="text-lg font-medium">
                        {p.name}
                        {p.id === hostId && <span className="ml-2 text-sm text-amber-300">👑 Host</span>}
                      </p>
                    </div>
                    <span className="text-xs uppercase tracking-[0.35em] text-cyan-100/60">
                      Ready
                    </span>
                  </div>
                ))}
                {players.length === 0 && (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/10 py-12 text-cyan-100/70">
                    Waiting for players to join…
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-fuchsia-900/60 via-slate-900/40 to-blue-900/40 p-6 shadow-[0_20px_60px_rgba(91,33,182,0.45)]">
            <div className="pointer-events-none absolute -left-24 top-0 h-64 w-64 rounded-full bg-fuchsia-500/20 blur-3xl" />
            <div className="relative">
              <div className="mb-6 flex items-center justify-between">
                <h2 className="text-2xl font-semibold">Game Mode</h2>
                {selectedMode && (
                  <span className="rounded-full bg-white/10 px-3 py-1 text-xs font-medium text-fuchsia-100">
                    Configured
                  </span>
                )}
              </div>

              {selectedMode ? (
                <div className="space-y-4">
                  <div className="flex flex-col gap-3 rounded-2xl border border-fuchsia-400/40 bg-white/5 p-5 shadow-[0_10px_35px_rgba(192,132,252,0.35)] md:flex-row md:items-center md:justify-between">
                    <div>
                      <p className="text-xs uppercase tracking-[0.35em] text-fuchsia-200/80">Selected Mode</p>
                      <p className="mt-2 text-2xl font-semibold">🎵 {selectedMode}</p>
                    </div>
                    {isHost && (
                      <button
                        onClick={() => setIsDropdownOpen(true)}
                        className="group flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-4 py-2 text-sm font-semibold text-white transition-all hover:border-fuchsia-400/70 hover:bg-fuchsia-400/20"
                      >
                        <span className="text-lg transition-transform group-hover:translate-x-0.5">⚙️</span>
                        Adjust Mode
                      </button>
                    )}
                  </div>

                  {isDropdownOpen && (
                    <>
                      <button
                        aria-label="Close mode menu"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setIsDropdownOpen(false)}
                      />
                      <div className="relative z-50 mt-3">
                        <div className="overflow-hidden rounded-2xl border border-fuchsia-400/30 bg-slate-950/95 backdrop-blur-xl shadow-[0_30px_60px_rgba(192,132,252,0.35)]">
                          <div className="h-1 bg-gradient-to-r from-fuchsia-400 via-purple-500 to-cyan-400" />
                          <ul role="listbox" className="max-h-64 overflow-auto divide-y divide-white/5">
                            {gameModes.length > 0 ? (
                              gameModes.map((modeName) => (
                                <li key={modeName}>
                                  <button
                                    role="option"
                                    onClick={() => handleModeSelection(modeName)}
                                    className="flex w-full items-center justify-between px-6 py-4 text-left text-white transition-colors hover:bg-white/10"
                                  >
                                    <span className="font-medium">🎵 {modeName}</span>
                                  </button>
                                </li>
                              ))
                            ) : (
                              <li className="px-6 py-4 text-center text-sm text-white/60">No game modes available</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              ) : (
                <div className="flex flex-col items-center justify-center gap-4 rounded-2xl border border-dashed border-white/20 bg-white/5 p-10 text-center">
                  <p className="text-base text-white/70">
                    {isHost
                      ? "Pick the vibe for this session to get everyone guessing!"
                      : "Waiting for your host to lock in a game mode."}
                  </p>
                  <button
                    onClick={toggleDropdown}
                    disabled={!isHost}
                    className={`flex items-center gap-3 rounded-full px-6 py-3 text-lg font-semibold transition-all ${
                      isHost
                        ? "bg-gradient-to-r from-fuchsia-500 to-cyan-500 text-white shadow-[0_15px_40px_rgba(14,165,233,0.35)] hover:shadow-[0_20px_50px_rgba(14,165,233,0.5)]"
                        : "cursor-not-allowed border border-white/20 text-white/60"
                    }`}
                    type="button"
                  >
                    {isHost ? "Open Mode Selector" : "Awaiting mode selection"}
                  </button>

                  {isDropdownOpen && isHost && (
                    <>
                      <button
                        aria-label="Close mode menu"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setIsDropdownOpen(false)}
                      />
                      <div className="relative z-50 w-full max-w-xl">
                        <div className="mt-3 overflow-hidden rounded-2xl border border-fuchsia-400/30 bg-slate-950/95 backdrop-blur-xl shadow-[0_30px_60px_rgba(192,132,252,0.35)]">
                          <div className="h-1 bg-gradient-to-r from-fuchsia-400 via-purple-500 to-cyan-400" />
                          <ul role="listbox" className="max-h-64 overflow-auto divide-y divide-white/5">
                            {gameModes.length > 0 ? (
                              gameModes.map((modeName) => (
                                <li key={modeName}>
                                  <button
                                    role="option"
                                    onClick={() => handleModeSelection(modeName)}
                                    className="flex w-full items-center justify-between px-6 py-4 text-left text-white transition-colors hover:bg-white/10"
                                  >
                                    <span className="font-medium">🎵 {modeName}</span>
                                  </button>
                                </li>
                              ))
                            ) : (
                              <li className="px-6 py-4 text-center text-sm text-white/60">No game modes available</li>
                            )}
                          </ul>
                        </div>
                      </div>
                    </>
                  )}
                </div>
              )}
            </div>
          </div>
        </div>

        <div className="space-y-8">
          {isHost && (
            <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-emerald-900/60 via-slate-900/40 to-cyan-900/40 p-6 shadow-[0_20px_60px_rgba(16,185,129,0.45)]">
              <div className="pointer-events-none absolute -right-20 top-1/2 h-56 w-56 -translate-y-1/2 rounded-full bg-emerald-400/20 blur-3xl" />
              <div className="relative space-y-5">
                <h2 className="text-2xl font-semibold">Audio Output</h2>
                <p className="text-sm text-white/70">
                  Decide whether the round audio plays everywhere or only on your device for in-person sessions.
                </p>
                <label className="flex items-start gap-4 rounded-2xl border border-white/10 bg-white/5 p-4 text-left transition-all hover:border-emerald-400/60 hover:bg-emerald-400/10">
                  <input
                    type="checkbox"
                    checked={hostOnlyAudio}
                    onChange={(e) => onAudioModeToggle(e.target.checked)}
                    className="mt-1 h-5 w-5 cursor-pointer accent-emerald-400"
                  />
                  <div>
                    <div className="flex items-center gap-2 text-base font-semibold">
                      <span className="text-xl">🔊</span>
                      In-Person Mode
                      {hostOnlyAudio && (
                        <span className="ml-2 rounded-full bg-emerald-400/20 px-2 py-0.5 text-xs font-semibold uppercase tracking-wider text-emerald-200">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="mt-2 text-sm text-white/60">
                      When enabled, only the host hears the audio—perfect for parties gathered around a single speaker.
                    </p>
                    {!hostOnlyAudio && (
                      <p className="mt-3 text-xs font-medium uppercase tracking-[0.35em] text-cyan-200/70">
                        Broadcast to every player
                      </p>
                    )}
                  </div>
                </label>
              </div>
            </div>
          )}

          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-cyan-900/40 p-6 shadow-[0_20px_60px_rgba(15,118,110,0.45)]">
            <div className="pointer-events-none absolute -bottom-24 left-10 h-64 w-64 rounded-full bg-cyan-400/20 blur-3xl" />
            <div className="relative flex flex-col gap-6">
              <div>
                <h2 className="text-2xl font-semibold">Session Status</h2>
                <p className="mt-2 text-sm text-white/70">
                  {isHost
                    ? "Launch the next round when you’re ready—everyone will see a five-second reveal window between rounds."
                    : "Hang tight while the host locks in settings and starts the game."}
                </p>
                {isHost && players.length === 1 && (
                  <p className="mt-2 text-xs font-semibold uppercase tracking-[0.35em] text-emerald-200/80">
                    Solo runs are welcome—start whenever you’re ready.
                  </p>
                )}
              </div>

              {isHost ? (
                <button
                  onClick={onStart}
                  disabled={!canStartGame}
                  className="group flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 px-6 py-4 text-lg font-semibold text-slate-950 shadow-[0_20px_60px_rgba(56,189,248,0.45)] transition-all hover:shadow-[0_25px_70px_rgba(56,189,248,0.6)] disabled:cursor-not-allowed disabled:opacity-60"
                >
                  <span className="text-xl transition-transform group-hover:translate-x-0.5">🚀</span>
                  Start Game
                </button>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/10 bg-white/5 py-8 text-center text-white/70">
                  <div className="text-4xl animate-pulse">⏳</div>
                  <p className="text-sm uppercase tracking-[0.35em]">Awaiting host</p>
                </div>
              )}

              {!canStartGame && isHost && (
                <p className="text-center text-xs font-semibold uppercase tracking-[0.35em] text-white/60">
                  {players.length === 0
                    ? "Invite at least one player to begin"
                    : "Select a game mode to unlock start"}
                </p>
              )}
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}


// ---- Playing View ----
function PlayingView({ songUrl, timeRemaining, onSubmitAnswer, reveal, answerResult }: PlayingViewProps) {
  const [artistInput, setArtistInput] = useState("");
  const [songInput, setSongInput] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [revealCountdown, setRevealCountdown] = useState(0);
  const [lastGuess, setLastGuess] = useState<{ artist: string; title: string } | null>(null);
  const audioRef = useRef<HTMLAudioElement>(null);

  const isRevealPhase = Boolean(reveal);
  const REVEAL_DURATION = 5;

  useEffect(() => {
    if (audioRef.current && songUrl) {
      audioRef.current.play().catch(err => {
        console.error("Auto-play failed:", err);
      });
    }
  }, [songUrl]);

  useEffect(() => {
    setHasSubmitted(false);
    setArtistInput("");
    setSongInput("");
    setLastGuess(null);
  }, [songUrl]);

  useEffect(() => {
    if (answerResult) {
      setHasSubmitted(true);
      setLastGuess({ artist: answerResult.artistGuess, title: answerResult.titleGuess });
    }
  }, [answerResult]);

  useEffect(() => {
    if (!isRevealPhase) {
      setRevealCountdown(0);
      return;
    }

    setRevealCountdown(REVEAL_DURATION);
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current.currentTime = 0;
    }

    const interval = window.setInterval(() => {
      setRevealCountdown((prev) => {
        if (prev <= 1) {
          window.clearInterval(interval);
          return 0;
        }
        return prev - 1;
      });
    }, 1000);

    return () => window.clearInterval(interval);
  }, [isRevealPhase]);

  const handleSubmit = () => {
    if (!artistInput || !songInput || hasSubmitted || isRevealPhase) return;
    const artist = artistInput.trim();
    const title = songInput.trim();
    onSubmitAnswer(artist, title);
    setLastGuess({ artist, title });
    setHasSubmitted(true);
  };

  const ROUND_DURATION = 30;
  const progressPercentage = Math.min(100, Math.max(0, (timeRemaining / ROUND_DURATION) * 100));
  const revealProgress = (revealCountdown / REVEAL_DURATION) * 100;
  const canSubmit = Boolean(!isRevealPhase && artistInput && songInput && timeRemaining > 0 && !hasSubmitted);

  const getProgressColor = () => {
    if (timeRemaining > ROUND_DURATION * 0.66) return "from-emerald-400 via-cyan-400 to-sky-500";
    if (timeRemaining > ROUND_DURATION * 0.33) return "from-amber-400 via-orange-400 to-rose-500";
    return "from-rose-500 via-fuchsia-500 to-purple-600";
  };

  const getTimerColor = () => {
    if (timeRemaining > ROUND_DURATION * 0.66) return "text-emerald-300";
    if (timeRemaining > ROUND_DURATION * 0.33) return "text-amber-300";
    return "text-rose-300";
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-center gap-4 mb-8">
        <div className="text-6xl animate-bounce">🎵</div>
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-600 bg-clip-text text-transparent">
          Guess the Song
        </h1>
      </div>

      <audio ref={audioRef} src={songUrl} className="hidden" />

      {isRevealPhase ? (
        <div className="relative overflow-hidden rounded-3xl border border-purple-500/30 bg-gradient-to-br from-purple-900/70 via-slate-900 to-black p-10 shadow-[0_20px_60px_rgba(168,85,247,0.35)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(124,58,237,0.35),_transparent_60%)]" />
          <div className="relative flex flex-col items-center gap-8 md:flex-row md:items-center md:justify-center">
            {reveal?.artistImageUrl ? (
              <div className="relative">
                <div className="absolute inset-0 -translate-x-4 translate-y-4 rounded-full bg-purple-500/30 blur-2xl" />
                <div className="relative h-40 w-40 overflow-hidden rounded-full ring-4 ring-purple-400/60 shadow-[0_0_40px_rgba(168,85,247,0.55)]">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={reveal.artistImageUrl}
                    alt={`${reveal.artist} artist portrait`}
                    className="h-full w-full object-cover"
                  />
                </div>
              </div>
            ) : (
              <div className="relative flex h-36 w-36 items-center justify-center rounded-full bg-gradient-to-br from-purple-500 to-indigo-500 text-5xl text-white shadow-[0_0_30px_rgba(129,140,248,0.6)]">
                🎤
              </div>
            )}

            <div className="max-w-xl text-center md:text-left">
              <p className="uppercase tracking-[0.4em] text-xs text-purple-200/80">Answer Reveal</p>
              <h2 className="mt-4 text-4xl font-extrabold text-white drop-shadow-[0_4px_16px_rgba(79,70,229,0.45)]">
                {reveal?.artist}
              </h2>
              <p className="mt-3 text-2xl font-semibold text-purple-100">“{reveal?.title}”</p>

              <div className="mt-6 space-y-3">
                <div className="inline-flex items-center gap-2 rounded-full border border-white/10 bg-white/10 px-4 py-2 text-sm font-medium text-purple-100/90 backdrop-blur">
                  <span className="text-lg">⏱️</span>
                  {revealCountdown > 0 ? `Next round in ${revealCountdown}s` : "Get ready for the next round!"}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-purple-400 via-fuchsia-400 to-pink-400 transition-all duration-700 ease-out"
                    style={{ width: `${revealProgress}%` }}
                  />
                </div>
                <RevealFeedback
                  hasSubmitted={hasSubmitted}
                  answerResult={answerResult}
                  lastGuess={lastGuess}
                />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-cyan-900/40 p-8 shadow-[0_20px_60px_rgba(14,165,233,0.35)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(6,182,212,0.18),_transparent_55%)]" />
            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col gap-3 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-xs uppercase tracking-[0.35em] text-cyan-100/70">Time Remaining</p>
                  <span className={`text-5xl font-bold ${getTimerColor()} transition-colors duration-300`}>{timeRemaining}s</span>
                </div>
                <div className="flex items-center gap-2 text-sm text-white/70">
                  <span className="inline-flex h-2 w-2 animate-ping rounded-full bg-cyan-400" aria-hidden="true" />
                  Guess before the beat drops!
                </div>
              </div>

              <div className="h-4 w-full overflow-hidden rounded-full border border-white/10 bg-white/10">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${getProgressColor()} shadow-[0_0_25px_rgba(56,189,248,0.45)] transition-all duration-700 ease-linear`}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              <div className="grid gap-4 md:grid-cols-2">
                <label className="group relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm font-medium text-white/70 transition-all focus-within:border-cyan-400/80 focus-within:bg-cyan-400/10">
                  <span className="text-xs uppercase tracking-[0.35em] text-white/50">Artist</span>
                  <input
                    type="text"
                    value={artistInput}
                    onChange={(e) => setArtistInput(e.target.value)}
                    placeholder="Who’s performing?"
                    disabled={hasSubmitted}
                    className="w-full bg-transparent text-lg font-semibold text-white placeholder:text-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="pointer-events-none absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-cyan-500 to-blue-500 text-xl text-white shadow-[0_8px_24px_rgba(14,165,233,0.4)]">
                    🎤
                  </span>
                </label>

                <label className="group relative flex flex-col gap-2 rounded-2xl border border-white/10 bg-white/5 p-5 text-sm font-medium text-white/70 transition-all focus-within:border-cyan-400/80 focus-within:bg-cyan-400/10">
                  <span className="text-xs uppercase tracking-[0.35em] text-white/50">Song Title</span>
                  <input
                    type="text"
                    value={songInput}
                    onChange={(e) => setSongInput(e.target.value)}
                    placeholder="Name that track"
                    disabled={hasSubmitted}
                    className="w-full bg-transparent text-lg font-semibold text-white placeholder:text-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="pointer-events-none absolute -right-2 -top-2 flex h-10 w-10 items-center justify-center rounded-full bg-gradient-to-br from-fuchsia-500 to-purple-500 text-xl text-white shadow-[0_8px_24px_rgba(192,132,252,0.4)]">
                    🎵
                  </span>
                </label>
              </div>
            </div>
          </div>

          {!hasSubmitted ? (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="group flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-500 px-8 py-4 text-lg font-semibold text-white shadow-[0_20px_60px_rgba(59,130,246,0.4)] transition-all hover:shadow-[0_24px_70px_rgba(59,130,246,0.55)] disabled:cursor-not-allowed disabled:opacity-60"
            >
              <span className="text-xl transition-transform group-hover:translate-x-0.5">✨</span>
              Submit Answer
            </button>
          ) : (
            <div className="flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-400/40 bg-emerald-400/15 px-6 py-5 text-lg font-semibold text-emerald-100 shadow-[0_15px_45px_rgba(16,185,129,0.35)]">
              <span className="text-2xl">✅</span>
              Answer locked in! Awaiting reveal…
            </div>
          )}
        </>
      )}
    </div>
  );
}

interface RevealFeedbackProps {
  hasSubmitted: boolean;
  answerResult: AnswerResultPayload | null;
  lastGuess: { artist: string; title: string } | null;
}

function RevealFeedback({ hasSubmitted, answerResult, lastGuess }: RevealFeedbackProps) {
  if (!hasSubmitted) {
    return (
      <div className="mt-2 space-y-2 rounded-2xl border border-white/15 bg-white/5 p-5 text-left text-white/80 shadow-[0_12px_35px_rgba(148,163,184,0.25)]">
        <div className="flex items-center gap-3 text-base font-semibold text-white/90">
          <span className="text-2xl">⌛</span>
          No answer submitted
        </div>
        <p className="text-sm text-white/70">You can still rack up points solo—jump back in when the next round drops.</p>
      </div>
    );
  }

  if (!answerResult) {
    return (
      <div className="mt-2 space-y-2 rounded-2xl border border-cyan-400/30 bg-cyan-400/10 p-5 text-left text-cyan-100 shadow-[0_12px_35px_rgba(6,182,212,0.25)]">
        <div className="flex items-center gap-3 text-base font-semibold">
          <span className="text-2xl">📡</span>
          Checking your answer…
        </div>
        <p className="text-sm text-cyan-100/80">Hang tight—your results arrive the moment the host wraps the timer.</p>
      </div>
    );
  }

  const { artistCorrect, titleCorrect, bothCorrect, scoreAwarded } = answerResult;

  let containerClasses = "mt-2 space-y-3 rounded-2xl p-5 text-left";
  let badgeClasses = "inline-flex items-center gap-2 rounded-full px-3 py-1 text-xs font-semibold uppercase tracking-[0.35em]";
  let icon = "";
  let headline = "";
  let description = "";

  if (bothCorrect) {
    containerClasses += " border border-emerald-400/60 bg-emerald-400/10 text-emerald-100 shadow-[0_18px_45px_rgba(16,185,129,0.35)]";
    badgeClasses += " bg-emerald-400/20 text-emerald-100";
    icon = "🌟";
    headline = "Perfect guess!";
    description = scoreAwarded > 0
      ? `You nailed both the artist and title for +${scoreAwarded} points.`
      : "You nailed both the artist and title!";
  } else if (artistCorrect || titleCorrect) {
    containerClasses += " border border-amber-400/60 bg-amber-400/10 text-amber-100 shadow-[0_18px_45px_rgba(251,191,36,0.3)]";
    badgeClasses += " bg-amber-400/20 text-amber-900";
    icon = "🎯";
    const matched = [artistCorrect ? "artist" : null, titleCorrect ? "title" : null].filter(Boolean).join(" & ");
    headline = "So close!";
    description = scoreAwarded > 0
      ? `You matched the ${matched} for +${scoreAwarded} points. Finish the pair next time for a full bonus.`
      : `You matched the ${matched}. Lock both in next round for a big score boost.`;
  } else {
    containerClasses += " border border-rose-400/60 bg-rose-400/10 text-rose-100 shadow-[0_18px_45px_rgba(244,63,94,0.35)]";
    badgeClasses += " bg-rose-400/20 text-rose-900";
    icon = "💥";
    headline = "Not quite this time";
    description = "No worries—keep the streak alive next round.";
  }

  return (
    <div className={containerClasses}>
      <div className="flex flex-wrap items-center gap-3 text-base font-semibold">
        <span className="text-2xl">{icon}</span>
        <span>{headline}</span>
        <span className={badgeClasses}>{scoreAwarded > 0 ? `+${scoreAwarded} pts` : "0 pts"}</span>
      </div>
      {lastGuess && (
        <p className="text-sm text-white/80">
          <span className="font-semibold text-white">Your guess:</span> {lastGuess.artist || "—"} — “{lastGuess.title || "—"}”
        </p>
      )}
      <p className="text-sm opacity-90">{description}</p>
    </div>
  );
}

// ---- Leaderboard View ----
function LeaderboardView({ leaderboard, currentRound, totalRounds, isHost, onNextRound }: LeaderboardViewProps) {
  return (
    <div className="space-y-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.4em] text-cyan-200/70">Round Recap</p>
        <h1 className="mt-3 text-5xl font-black text-white drop-shadow-[0_12px_45px_rgba(56,189,248,0.35)]">
          Round {currentRound} / {totalRounds}
        </h1>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/70 via-slate-900/40 to-purple-900/40 p-8 shadow-[0_20px_60px_rgba(88,28,135,0.35)]">
        <div className="pointer-events-none absolute -right-32 top-0 h-64 w-64 rounded-full bg-purple-500/20 blur-3xl" />
        <div className="pointer-events-none absolute -left-20 bottom-0 h-56 w-56 rounded-full bg-cyan-400/15 blur-3xl" />
        <div className="relative space-y-6">
          <div className="flex items-center justify-between">
            <h2 className="text-2xl font-semibold text-white">Leaderboard</h2>
            <span className="rounded-full bg-white/10 px-4 py-1 text-xs font-semibold uppercase tracking-[0.35em] text-white/70">
              {leaderboard.length} players
            </span>
          </div>

          <div className="space-y-3">
            {leaderboard.map((p, index) => {
              const accent =
                index === 0
                  ? "from-amber-300/80 via-yellow-400/80 to-orange-500/80"
                  : index === 1
                  ? "from-slate-200/70 via-slate-300/70 to-slate-500/70"
                  : index === 2
                  ? "from-orange-400/70 via-amber-400/70 to-rose-500/70"
                  : "from-cyan-500/40 via-blue-500/40 to-purple-500/40";

              return (
                <div
                  key={`${p.name}-${index}`}
                  className={`relative flex items-center justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r ${accent} px-6 py-4 text-white shadow-[0_15px_45px_rgba(14,165,233,0.25)] backdrop-blur transition-transform hover:-translate-y-0.5`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/40 bg-black/20 text-xl font-bold">
                      #{index + 1}
                    </div>
                    <div>
                      <p className="text-lg font-semibold">
                        {index === 0 && "🥇 "}
                        {index === 1 && "🥈 "}
                        {index === 2 && "🥉 "}
                        {p.name}
                      </p>
                      <p className="text-xs uppercase tracking-[0.35em] text-white/60">Score</p>
                    </div>
                  </div>
                  <p className="text-2xl font-bold text-white drop-shadow-[0_4px_18px_rgba(59,130,246,0.4)]">{p.score} pts</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isHost ? (
        <button
          onClick={onNextRound}
          className="group flex w-full items-center justify-center gap-3 rounded-full bg-gradient-to-r from-emerald-400 via-cyan-400 to-blue-500 px-6 py-4 text-lg font-semibold text-slate-950 shadow-[0_20px_60px_rgba(56,189,248,0.45)] transition-all hover:shadow-[0_26px_80px_rgba(56,189,248,0.6)]"
        >
          <span className="text-xl transition-transform group-hover:translate-x-0.5">➡️</span>
          Launch Next Round
        </button>
      ) : (
        <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-white/5 py-6 text-center text-white/70">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(6,182,212,0.18),_transparent_60%)]" />
          <div className="relative flex flex-col items-center gap-3">
            <span className="text-3xl animate-pulse">⏳</span>
            <p className="text-xs uppercase tracking-[0.35em]">Waiting for host…</p>
          </div>
        </div>
      )}
    </div>
  );
}

// ---- Final Results View ----
function FinalResultsView({ leaderboard }: ResultsViewProps) {
  return (
    <div className="space-y-10">
      <div className="text-center">
        <p className="text-sm uppercase tracking-[0.4em] text-amber-200/70">Grand Finale</p>
        <h1 className="mt-3 text-6xl font-black text-white drop-shadow-[0_16px_60px_rgba(249,115,22,0.45)]">
          Tempo Champions
        </h1>
      </div>

      <div className="relative overflow-hidden rounded-3xl border border-white/10 bg-gradient-to-br from-slate-900/80 via-slate-900/40 to-amber-900/40 p-10 shadow-[0_25px_80px_rgba(249,115,22,0.35)]">
        <div className="pointer-events-none absolute -top-28 right-10 h-72 w-72 rounded-full bg-amber-400/25 blur-3xl" />
        <div className="pointer-events-none absolute -bottom-24 left-12 h-64 w-64 rounded-full bg-pink-500/20 blur-3xl" />
        <div className="relative space-y-6">
          <h2 className="text-center text-2xl font-semibold text-white/90">Final Leaderboard</h2>
          <div className="grid gap-4">
            {leaderboard.map((p, index) => {
              const tier =
                index === 0
                  ? "from-amber-300/90 via-yellow-400/90 to-orange-500/90"
                  : index === 1
                  ? "from-slate-200/80 via-slate-400/80 to-slate-500/80"
                  : index === 2
                  ? "from-rose-400/80 via-pink-500/80 to-red-500/80"
                  : "from-purple-500/40 via-blue-500/40 to-cyan-500/40";

              return (
                <div
                  key={`${p.name}-${index}`}
                  className={`relative flex items-center justify-between overflow-hidden rounded-2xl border border-white/10 bg-gradient-to-r ${tier} px-6 py-5 text-white shadow-[0_20px_60px_rgba(15,23,42,0.45)] backdrop-blur transition-transform hover:-translate-y-0.5`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">
                      {index === 0 && "🥇"}
                      {index === 1 && "🥈"}
                      {index === 2 && "🥉"}
                    </span>
                    <div>
                      <p className="text-xl font-semibold">#{index + 1} {p.name}</p>
                      <p className="text-xs uppercase tracking-[0.35em] text-white/70">Total Score</p>
                    </div>
                  </div>
                  <p className="text-3xl font-bold text-white drop-shadow-[0_6px_24px_rgba(249,115,22,0.45)]">{p.score} pts</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}
