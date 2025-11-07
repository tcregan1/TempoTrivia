"use client";
import { Suspense, useEffect, useRef, useState } from "react";
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
  modeDescriptions: string[];
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
    <div className="relative min-h-screen overflow-hidden text-white">
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,118,200,0.2),_transparent_65%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(63,164,255,0.22),_transparent_70%)]" />
      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(115deg,rgba(255,255,255,0.05)_0%,transparent_40%,transparent_60%,rgba(86,175,255,0.18)_100%)]" />
      <div className="pointer-events-none absolute left-1/2 top-0 hidden h-full w-px -translate-x-1/2 bg-gradient-to-b from-transparent via-white/25 to-transparent lg:block" />
      <div className="relative mx-auto max-w-6xl px-6 py-12">
        <div className="relative overflow-hidden rounded-[42px] border border-white/12 bg-white/5/60 p-10 shadow-[0_50px_150px_rgba(4,6,18,0.85)] backdrop-blur-2xl">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,118,200,0.2),_transparent_55%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.08)_0%,transparent_50%,transparent_65%,rgba(68,184,255,0.2)_100%)]" />
          <div className="relative">
            {children}
          </div>
        </div>
      </div>
    </div>
  );
}

// ---- Main Game Client ----
function GameClient() {
  const [gameState, setGameState] = useState<GameState>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const desiredModeRef = useRef<string | null>(null);
  const [songData, setSongData] = useState<{ url: string; title: string; artist: string }>({ url: "", title: "", artist: "" });
  const [timeRemaining, setTimeRemaining] = useState<number>(30);
  const [leaderboard, setLeaderboard] = useState<LeaderboardPlayer[]>([]);
  const [currentRound, setCurrentRound] = useState<number>(0);
  const [totalRounds, setTotalRounds] = useState<number>(10);
  const params = useSearchParams();
  const rc = params.get("roomcode") ?? "";
  const alias = params.get("nickname") ?? "";
  if (desiredModeRef.current === null) {
    desiredModeRef.current = params.get("mode");
  }
  const [hostId, setHostId] = useState<string>("");
  const [myPlayerId, setMyPlayerId] = useState<string>("");
  const [gameModes, setGameModes] = useState<string[]>([]);
  const [modeDescriptions, setModeDescriptions] = useState<string[]>([]);
  const [selectedGameMode, setSelectedGameMode] = useState<string>("");
  const [hostOnlyAudio, setHostOnlyAudio] = useState(false);
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
            console.log("Received Game_modes");
            const names = Array.isArray(msg.payload?.name)
              ? msg.payload.name
              : [];
            const descriptions = Array.isArray(msg.payload?.description)
              ? msg.payload.description
              : [];
            setGameModes(names);
            setModeDescriptions(descriptions);
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
            setHostId(msg.payload?.hostId || "");
            setSelectedGameMode(msg.payload?.selectedMode || "");
            break;
          }
          case "round_started": {
            const sd = msg.payload?.songData ?? { url: "", title: "", artist: "" };
            setSongData(sd);
            setTimeRemaining(msg.payload?.duration ?? 30);
            setGameState("playing");
            setReveal(null);
            setAnswerResult(null);
            break;
          }
          case "mode_selected": {
            console.log("Received Mode Selection Update");
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
    const desired = desiredModeRef.current;
    if (!desired) return;
    if (!gameModes.includes(desired)) return;
    if (!hostId || !myPlayerId || hostId !== myPlayerId) return;
    if (selectedGameMode === desired) {
      desiredModeRef.current = null;
      return;
    }
    handleSelectMode(desired);
    desiredModeRef.current = null;
  }, [gameModes, hostId, myPlayerId, selectedGameMode]);

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
          modeDescriptions={modeDescriptions}
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
  modeDescriptions,
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
      <section className="relative overflow-hidden rounded-[32px] border border-white/12 bg-gradient-to-r from-[#12061f]/90 via-[#04020f]/96 to-[#051635]/92 p-8 shadow-[0_40px_120px_rgba(6,10,28,0.75)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,118,200,0.25),_transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(135deg,rgba(255,255,255,0.1)_0%,transparent_45%,transparent_65%,rgba(70,180,255,0.25)_100%)]" />
        <div className="relative flex flex-wrap items-end justify-between gap-6">
          <div className="space-y-4">
            <div className="inline-flex items-center gap-3 rounded-full border border-white/15 bg-white/10 px-4 py-1">
              <span className="text-[11px] uppercase tracking-[0.5em] text-white/75">TempoTrivia</span>
              <span className="h-1 w-1 rounded-full bg-gradient-to-r from-fuchsia-400 to-cyan-400" />
              <span className="text-[11px] uppercase tracking-[0.35em] text-white/50">Operations deck</span>
            </div>
            <h1 className="text-4xl font-semibold uppercase tracking-[0.3em] text-white drop-shadow-[0_18px_70px_rgba(86,181,255,0.45)] sm:text-5xl">
              Lobby control nexus
            </h1>
            <p className="max-w-2xl text-sm text-white/75 md:text-base">
              Monitor squad readiness, configure the active playlist protocol, and align audio distribution. Once the access deck glows cyan, you’re clear to deploy the next round.
            </p>
            <div className="flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-[0.4em] text-white/55">
              <span className="rounded-full border border-white/15 px-4 py-2">Real-time sync</span>
              <span className="rounded-full border border-white/15 px-4 py-2">Player telemetry</span>
              <span className="rounded-full border border-white/15 px-4 py-2">Host overrides</span>
            </div>
          </div>
          <div className="relative overflow-hidden rounded-[22px] border border-white/15 bg-white/10 px-6 py-5 text-right shadow-[0_20px_80px_rgba(82,183,255,0.35)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(86,181,255,0.35),_transparent_70%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.08)_0%,transparent_60%,rgba(255,118,200,0.2)_100%)]" />
            <div className="relative space-y-2">
              <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Room access key</p>
              <p className="text-sm font-semibold uppercase tracking-[0.5em] text-white/60">Share securely</p>
              <p className="text-3xl font-semibold tracking-[0.55em] text-white">{roomCode}</p>
            </div>
          </div>
        </div>
      </section>

      <div className="grid gap-8 xl:grid-cols-[1.1fr_0.9fr]">
        <div className="space-y-8">
          <div className="relative overflow-hidden rounded-[32px] border border-white/12 bg-gradient-to-br from-[#150a2b]/88 via-[#05030c]/96 to-[#081736]/92 p-6 shadow-[0_36px_110px_rgba(10,20,45,0.75)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(63,164,255,0.25),_transparent_60%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.08)_0%,transparent_55%,rgba(255,118,200,0.2)_100%)]" />
            <div className="relative space-y-5">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Squad manifest</p>
                  <h2 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em] text-white">Active players</h2>
                </div>
                <span className="rounded-full border border-white/15 bg-white/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.4em] text-white/70">
                  {players.length} linked
                </span>
              </div>
              <div className="space-y-3">
                {players.map((p) => (
                  <div
                    key={p.id}
                    className="group relative flex items-center justify-between overflow-hidden rounded-2xl border border-white/12 bg-white/5/70 px-5 py-4 text-white transition-all duration-300 hover:-translate-y-0.5 hover:border-fuchsia-400/60 hover:bg-fuchsia-400/10"
                  >
                    <div className="pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300 group-hover:opacity-100" style={{ backgroundImage: "linear-gradient(140deg, rgba(255,118,200,0.18) 0%, transparent 45%, rgba(70,180,255,0.25) 100%)" }} />
                    <div className="relative flex items-center gap-3">
                      <div className="flex h-11 w-11 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-fuchsia-500 via-sky-500 to-cyan-500 text-lg font-semibold">
                        {p.name.charAt(0).toUpperCase()}
                      </div>
                      <div className="text-left">
                        <p className="text-lg font-semibold uppercase tracking-[0.2em]">
                          {p.name}
                          {p.id === hostId && <span className="ml-2 text-xs text-amber-300">◉ Host</span>}
                        </p>
                        <p className="text-[11px] uppercase tracking-[0.4em] text-white/45">Status feed</p>
                      </div>
                    </div>
                    <span className="relative text-[11px] uppercase tracking-[0.45em] text-white/65">Ready</span>
                  </div>
                ))}
                {players.length === 0 && (
                  <div className="flex items-center justify-center rounded-2xl border border-dashed border-white/20 py-12 text-white/60">
                    Awaiting first connection…
                  </div>
                )}
              </div>
            </div>
          </div>

          <div className="relative overflow-hidden rounded-[32px] border border-white/12 bg-gradient-to-br from-[#1d0a31]/90 via-[#05030c]/96 to-[#0a1f3f]/92 p-6 shadow-[0_36px_110px_rgba(25,8,55,0.7)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,118,200,0.28),_transparent_55%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(145deg,rgba(255,255,255,0.08)_0%,transparent_50%,transparent_65%,rgba(65,178,255,0.25)_100%)]" />
            <div className="relative space-y-6">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Playlist protocol</p>
                  <h2 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em] text-white">Mode selection</h2>
                </div>
                {selectedMode && (
                  <span className="rounded-full border border-white/15 bg-white/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.4em] text-white/70">
                    Online
                  </span>
                )}
              </div>

              {selectedMode ? (
                <div className="space-y-4">
                  <div className="relative flex flex-col gap-3 overflow-hidden rounded-2xl border border-white/12 bg-white/5 p-5 text-left shadow-[0_24px_80px_rgba(112,66,192,0.35)] md:flex-row md:items-center md:justify-between">
                    <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(120deg,rgba(255,118,200,0.22)_0%,transparent_50%,rgba(72,176,255,0.28)_100%)] opacity-80" />
                    <div className="relative">
                      <p className="text-[11px] uppercase tracking-[0.45em] text-white/70">Active mode</p>
                      <p className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em] text-white">{selectedMode}</p>
                    </div>
                    {isHost && (
                      <button
                        onClick={() => setIsDropdownOpen(true)}
                        className="relative flex items-center gap-2 rounded-full border border-white/20 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.45em] text-white transition-all duration-300 hover:border-fuchsia-400/70 hover:bg-fuchsia-400/20"
                      >
                        <span className="text-base">⚙</span>
                        Reconfigure
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
                        <div className="overflow-hidden rounded-2xl border border-fuchsia-400/40 bg-[#05030c]/95 backdrop-blur-xl shadow-[0_32px_90px_rgba(128,90,255,0.4)]">
                          <div className="h-1 bg-gradient-to-r from-fuchsia-400 via-purple-500 to-cyan-400" />
                          <ul role="listbox" className="max-h-64 overflow-auto divide-y divide-white/5">
                            {gameModes.length > 0 ? (
                              gameModes.map((modeName, index) => {
                                const description = modeDescriptions[index] ?? "";
                                return (
                                  <li key={modeName}>
                                    <button
                                      role="option"
                                      onClick={() => handleModeSelection(modeName)}
                                      className="flex w-full items-start justify-between gap-4 px-6 py-4 text-left text-white transition-colors hover:bg-white/10"
                                    >
                                      <span className="font-medium">
                                        {modeName}
                                        {description && (
                                          <span className="mt-2 block text-sm font-normal text-white/60">
                                            {description}
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-[11px] uppercase tracking-[0.4em] text-white/40">
                                        Engage
                                      </span>
                                    </button>
                                  </li>
                                );
                              })
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
                <div className="flex flex-col items-center justify-center gap-5 rounded-2xl border border-dashed border-white/25 bg-white/5 p-10 text-center">
                  <p className="text-sm text-white/70">
                    {isHost
                      ? "Select the sonic profile for this match to brief every participant."
                      : "Awaiting host configuration for the upcoming playlist protocol."}
                  </p>
                  <button
                    onClick={toggleDropdown}
                    disabled={!isHost}
                    className={`flex items-center gap-3 rounded-full px-7 py-3 text-sm font-semibold uppercase tracking-[0.4em] transition-all duration-300 ${
                      isHost
                        ? "bg-gradient-to-r from-fuchsia-500 via-purple-500 to-cyan-500 text-white shadow-[0_24px_80px_rgba(129,80,255,0.45)] hover:shadow-[0_28px_95px_rgba(129,80,255,0.6)]"
                        : "cursor-not-allowed border border-white/20 text-white/60"
                    }`}
                    type="button"
                  >
                    {isHost ? "Open selector" : "Stand by"}
                  </button>

                  {isDropdownOpen && isHost && (
                    <>
                      <button
                        aria-label="Close mode menu"
                        className="fixed inset-0 z-40 cursor-default"
                        onClick={() => setIsDropdownOpen(false)}
                      />
                      <div className="relative z-50 w-full max-w-xl">
                        <div className="mt-3 overflow-hidden rounded-2xl border border-fuchsia-400/40 bg-[#05030c]/95 backdrop-blur-xl shadow-[0_32px_90px_rgba(128,90,255,0.4)]">
                          <div className="h-1 bg-gradient-to-r from-fuchsia-400 via-purple-500 to-cyan-400" />
                          <ul role="listbox" className="max-h-64 overflow-auto divide-y divide-white/5">
                            {gameModes.length > 0 ? (
                              gameModes.map((modeName, index) => {
                                const description = modeDescriptions[index] ?? "";
                                return (
                                  <li key={modeName}>
                                    <button
                                      role="option"
                                      onClick={() => handleModeSelection(modeName)}
                                      className="flex w-full items-start justify-between gap-4 px-6 py-4 text-left text-white transition-colors hover:bg-white/10"
                                    >
                                      <span className="font-medium">
                                        {modeName}
                                        {description && (
                                          <span className="mt-2 block text-sm font-normal text-white/60">
                                            {description}
                                          </span>
                                        )}
                                      </span>
                                      <span className="text-[11px] uppercase tracking-[0.4em] text-white/40">Engage</span>
                                    </button>
                                  </li>
                                );
                              })
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
            <div className="relative overflow-hidden rounded-[32px] border border-white/12 bg-gradient-to-br from-[#0f271f]/85 via-[#05030c]/96 to-[#0a2f36]/92 p-6 shadow-[0_32px_100px_rgba(9,38,34,0.65)]">
              <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(64,228,186,0.28),_transparent_60%)]" />
              <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.08)_0%,transparent_55%,rgba(86,181,255,0.2)_100%)]" />
              <div className="relative space-y-5">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Audio channel</p>
                  <h2 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em] text-white">Output routing</h2>
                </div>
                <p className="text-sm text-white/70">
                  Choose whether playback routes to every player headset or stays locked to your device for centralized listening sessions.
                </p>
                <label className="flex items-start gap-4 overflow-hidden rounded-2xl border border-white/12 bg-white/5 p-4 text-left transition-all duration-300 hover:border-emerald-400/60 hover:bg-emerald-400/15">
                  <input
                    type="checkbox"
                    checked={hostOnlyAudio}
                    onChange={(e) => onAudioModeToggle(e.target.checked)}
                    className="mt-1 h-5 w-5 cursor-pointer accent-emerald-400"
                  />
                  <div className="space-y-2">
                    <div className="flex flex-wrap items-center gap-2 text-sm font-semibold uppercase tracking-[0.35em] text-white">
                      <span className="text-lg">🔊</span>
                      In-person mode
                      {hostOnlyAudio && (
                        <span className="rounded-full border border-emerald-400/60 bg-emerald-400/20 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-[0.4em] text-emerald-100">
                          Active
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-white/65">
                      Toggle on to keep the soundtrack local. Leave it off for full broadcast synchronization across the network.
                    </p>
                    <p className="text-[10px] uppercase tracking-[0.4em] text-emerald-200/70">
                      {hostOnlyAudio ? "Host-only channel engaged" : "Broadcast to all squad members"}
                    </p>
                  </div>
                </label>
              </div>
            </div>
          )}

          <div className="relative overflow-hidden rounded-[32px] border border-white/12 bg-gradient-to-br from-[#110728]/88 via-[#05030c]/96 to-[#041b34]/92 p-6 shadow-[0_34px_110px_rgba(8,16,38,0.7)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_bottom,_rgba(67,170,255,0.28),_transparent_60%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.08)_0%,transparent_55%,rgba(255,118,200,0.2)_100%)]" />
            <div className="relative flex flex-col gap-6">
              <div className="space-y-2">
                <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Session status</p>
                <h2 className="text-2xl font-semibold uppercase tracking-[0.3em] text-white">Launch control</h2>
                <p className="text-sm text-white/70">
                  {isHost
                    ? "Greenlight the next round once all systems align. A reveal countdown pulses between rounds before the new track initializes."
                    : "Hold position while the host finalizes the playlist protocol and prepares the countdown."}
                </p>
                {isHost && players.length === 1 && (
                  <p className="text-[10px] font-semibold uppercase tracking-[0.4em] text-emerald-200/80">
                    Solo mode primed—launch whenever ready.
                  </p>
                )}
              </div>

              {isHost ? (
                <button
                  onClick={onStart}
                  disabled={!canStartGame}
                  className={`group relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full px-8 py-4 text-sm font-semibold uppercase tracking-[0.45em] transition-all duration-300
                    ${canStartGame
                      ? "bg-gradient-to-r from-fuchsia-500 via-blue-500 to-cyan-400 text-white shadow-[0_28px_90px_rgba(76,156,255,0.55)] hover:shadow-[0_32px_110px_rgba(76,156,255,0.7)]"
                      : "cursor-not-allowed border border-white/20 bg-white/10 text-white/50"}
                  `}
                >
                  <span className="text-lg">⟠</span>
                  Initiate round
                </button>
              ) : (
                <div className="flex flex-col items-center justify-center gap-3 rounded-2xl border border-white/12 bg-white/5 py-8 text-center text-white/70">
                  <div className="text-4xl animate-pulse">⏳</div>
                  <p className="text-[11px] uppercase tracking-[0.45em]">Awaiting host</p>
                </div>
              )}

              {!canStartGame && isHost && (
                <p className="text-center text-[10px] font-semibold uppercase tracking-[0.4em] text-white/60">
                  {players.length === 0
                    ? "Need at least one additional player before ignition."
                    : "Select a playlist protocol to unlock launch."}
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
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-[30px] border border-white/12 bg-gradient-to-r from-[#130624]/90 via-[#04020f]/96 to-[#071d3a]/92 p-6 shadow-[0_36px_110px_rgba(8,14,32,0.75)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top_left,_rgba(255,118,200,0.24),_transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.08)_0%,transparent_50%,rgba(63,169,255,0.25)_100%)]" />
        <div className="relative flex flex-wrap items-center justify-between gap-6">
          <div className="flex items-center gap-4">
            <span className="flex h-14 w-14 items-center justify-center rounded-full border border-white/15 bg-white/10 text-3xl">🎵</span>
            <div>
              <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Signal decoding</p>
              <h1 className="text-3xl font-semibold uppercase tracking-[0.3em] text-white sm:text-4xl">Identify the track</h1>
            </div>
          </div>
          <div className="flex flex-wrap items-center gap-4 text-[11px] uppercase tracking-[0.4em] text-white/55">
            <span className="rounded-full border border-white/15 px-4 py-2">Live waveform</span>
            <span className="rounded-full border border-white/15 px-4 py-2">30s window</span>
            <span className="rounded-full border border-white/15 px-4 py-2">Dual verification</span>
          </div>
        </div>
      </div>

      <audio ref={audioRef} src={songUrl} className="hidden" />

      {isRevealPhase ? (
        <div className="relative overflow-hidden rounded-[36px] border border-white/12 bg-gradient-to-br from-[#1a0734]/88 via-[#05030c]/96 to-[#0a2142]/92 p-10 shadow-[0_42px_120px_rgba(18,10,40,0.75)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(178,102,255,0.28),_transparent_60%)]" />
          <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.08)_0%,transparent_50%,rgba(63,169,255,0.25)_100%)]" />
          <div className="relative flex flex-col items-center gap-10 md:flex-row md:items-center md:justify-center">
            <div className="relative flex items-center justify-center">
              <div className="absolute -left-6 top-6 h-44 w-44 rounded-full bg-fuchsia-500/25 blur-3xl" />
              <div className="relative h-44 w-44 overflow-hidden rounded-full border border-white/15 bg-black/30 shadow-[0_0_50px_rgba(178,102,255,0.45)]">
                {/* eslint-disable-next-line @next/next/no-img-element */}
                {reveal?.artistImageUrl ? (
                  <img src={reveal.artistImageUrl} alt={`${reveal.artist} artist portrait`} className="h-full w-full object-cover" />
                ) : (
                  <div className="flex h-full w-full items-center justify-center text-5xl">🎤</div>
                )}
              </div>
            </div>

            <div className="max-w-xl text-center md:text-left">
              <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Answer reveal</p>
              <h2 className="mt-4 text-4xl font-semibold uppercase tracking-[0.25em] text-white">{reveal?.artist}</h2>
              <p className="mt-3 text-xl font-semibold text-white/80">“{reveal?.title}”</p>

              <div className="mt-6 space-y-4">
                <div className="inline-flex items-center gap-3 rounded-full border border-white/12 bg-white/10 px-5 py-2 text-xs font-semibold uppercase tracking-[0.4em] text-white/75 backdrop-blur">
                  <span className="text-base">⏱</span>
                  {revealCountdown > 0 ? `Next round in ${revealCountdown}s` : "Prepare for redeploy"}
                </div>
                <div className="h-2 w-full overflow-hidden rounded-full bg-white/10">
                  <div
                    className="h-full rounded-full bg-gradient-to-r from-fuchsia-400 via-purple-400 to-cyan-400 transition-all duration-700 ease-out"
                    style={{ width: `${revealProgress}%` }}
                  />
                </div>
                <RevealFeedback hasSubmitted={hasSubmitted} answerResult={answerResult} lastGuess={lastGuess} />
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="relative overflow-hidden rounded-[36px] border border-white/12 bg-gradient-to-br from-[#0e1231]/90 via-[#05030c]/96 to-[#062544]/92 p-8 shadow-[0_36px_110px_rgba(6,18,45,0.75)]">
            <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(63,169,255,0.25),_transparent_55%)]" />
            <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.08)_0%,transparent_60%,rgba(255,118,200,0.2)_100%)]" />
            <div className="relative flex flex-col gap-6">
              <div className="flex flex-col gap-4 md:flex-row md:items-center md:justify-between">
                <div>
                  <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Time remaining</p>
                  <span className={`text-5xl font-semibold ${getTimerColor()} transition-colors duration-300`}>{timeRemaining}s</span>
                </div>
                <div className="flex items-center gap-3 text-xs uppercase tracking-[0.4em] text-white/60">
                  <span className="inline-flex h-2 w-2 animate-ping rounded-full bg-cyan-400" aria-hidden="true" />
                  Submit before silence
                </div>
              </div>

              <div className="h-3 w-full overflow-hidden rounded-full border border-white/15 bg-white/10">
                <div
                  className={`h-full rounded-full bg-gradient-to-r ${getProgressColor()} shadow-[0_0_35px_rgba(63,169,255,0.45)] transition-all duration-700 ease-linear`}
                  style={{ width: `${progressPercentage}%` }}
                />
              </div>

              <div className="grid gap-5 md:grid-cols-2">
                <label className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-white/12 bg-white/10 p-5 text-xs font-semibold uppercase tracking-[0.4em] text-white/60 transition-all focus-within:border-fuchsia-400/70 focus-within:bg-fuchsia-400/15">
                  Artist signature
                  <input
                    type="text"
                    value={artistInput}
                    onChange={(e) => setArtistInput(e.target.value)}
                    placeholder="Who’s performing?"
                    disabled={hasSubmitted}
                    className="mt-3 w-full bg-transparent text-lg font-semibold uppercase tracking-[0.2em] text-white placeholder:text-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="pointer-events-none absolute -right-2 -top-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-fuchsia-500 via-sky-500 to-cyan-500 text-xl text-white shadow-[0_18px_50px_rgba(76,180,255,0.45)]">
                    🎤
                  </span>
                </label>

                <label className="group relative flex flex-col gap-2 overflow-hidden rounded-2xl border border-white/12 bg-white/10 p-5 text-xs font-semibold uppercase tracking-[0.4em] text-white/60 transition-all focus-within:border-fuchsia-400/70 focus-within:bg-fuchsia-400/15">
                  Track designation
                  <input
                    type="text"
                    value={songInput}
                    onChange={(e) => setSongInput(e.target.value)}
                    placeholder="Name that track"
                    disabled={hasSubmitted}
                    className="mt-3 w-full bg-transparent text-lg font-semibold uppercase tracking-[0.2em] text-white placeholder:text-white/30 focus:outline-none disabled:cursor-not-allowed disabled:opacity-60"
                  />
                  <span className="pointer-events-none absolute -right-2 -top-2 flex h-12 w-12 items-center justify-center rounded-full border border-white/20 bg-gradient-to-br from-purple-500 via-fuchsia-500 to-pink-500 text-xl text-white shadow-[0_18px_50px_rgba(211,110,255,0.45)]">
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
              className={`relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full px-9 py-4 text-sm font-semibold uppercase tracking-[0.45em] transition-all duration-300
                ${canSubmit
                  ? "bg-gradient-to-r from-fuchsia-500 via-blue-500 to-cyan-400 text-white shadow-[0_26px_90px_rgba(76,169,255,0.5)] hover:shadow-[0_30px_110px_rgba(76,169,255,0.65)]"
                  : "cursor-not-allowed border border-white/20 bg-white/10 text-white/40"}
              `}
            >
              <span className="text-lg">✹</span>
              Transmit guess
            </button>
          ) : (
            <div className="flex w-full items-center justify-center gap-3 rounded-2xl border border-emerald-400/45 bg-emerald-400/20 px-6 py-5 text-sm font-semibold uppercase tracking-[0.4em] text-emerald-100 shadow-[0_24px_80px_rgba(32,201,151,0.45)]">
              Response locked · Await reveal
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
      <div className="mt-2 space-y-2 rounded-2xl border border-white/15 bg-white/10 p-5 text-left text-white/80 shadow-[0_24px_80px_rgba(94,108,137,0.35)]">
        <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.35em] text-white">
          <span className="text-lg">⌛</span>
          Awaiting transmission
        </div>
        <p className="text-xs text-white/65">
          Log both artist and title to submit a guess. The channel remains open until the timer expires.
        </p>
      </div>
    );
  }

  if (!answerResult) {
    return (
      <div className="mt-2 space-y-2 rounded-2xl border border-cyan-400/40 bg-cyan-400/15 p-5 text-left text-cyan-100 shadow-[0_24px_80px_rgba(67,206,255,0.35)]">
        <div className="flex items-center gap-3 text-sm font-semibold uppercase tracking-[0.35em]">
          <span className="text-lg">📡</span>
          Signal analysis in progress
        </div>
        <p className="text-xs text-cyan-100/80">
          Host console is verifying every guess. Results deploy instantly when the reveal cycle begins.
        </p>
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
      <div className="flex flex-wrap items-center gap-3 text-sm font-semibold uppercase tracking-[0.35em]">
        <span className="text-lg">{icon}</span>
        <span>{headline}</span>
        <span className={badgeClasses}>{scoreAwarded > 0 ? `+${scoreAwarded} pts` : "0 pts"}</span>
      </div>
      {lastGuess && (
        <p className="text-xs text-white/80">
          <span className="font-semibold text-white">Logged:</span> {lastGuess.artist || "—"} — “{lastGuess.title || "—"}”
        </p>
      )}
      <p className="text-xs opacity-90">{description}</p>
    </div>
  );
}

// ---- Leaderboard View ----
function LeaderboardView({ leaderboard, currentRound, totalRounds, isHost, onNextRound }: LeaderboardViewProps) {
  return (
    <div className="space-y-10">
      <div className="relative overflow-hidden rounded-[30px] border border-white/12 bg-gradient-to-r from-[#12061f]/90 via-[#04020f]/96 to-[#051c39]/92 p-6 text-center shadow-[0_36px_110px_rgba(6,10,28,0.75)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,118,200,0.25),_transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(140deg,rgba(255,255,255,0.08)_0%,transparent_50%,rgba(63,169,255,0.25)_100%)]" />
        <div className="relative space-y-3">
          <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Round recap</p>
          <h1 className="text-4xl font-semibold uppercase tracking-[0.3em] text-white">Round {currentRound} / {totalRounds}</h1>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[36px] border border-white/12 bg-gradient-to-br from-[#1c0832]/90 via-[#05030c]/96 to-[#082446]/92 p-8 shadow-[0_42px_120px_rgba(20,8,44,0.75)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(86,175,255,0.22),_transparent_65%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.08)_0%,transparent_55%,rgba(255,118,200,0.2)_100%)]" />
        <div className="relative space-y-6">
          <div className="flex flex-wrap items-center justify-between gap-4">
            <div>
              <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Leaderboard</p>
              <h2 className="mt-2 text-2xl font-semibold uppercase tracking-[0.3em] text-white">Signal standings</h2>
            </div>
            <span className="rounded-full border border-white/15 bg-white/10 px-4 py-1 text-[11px] font-semibold uppercase tracking-[0.4em] text-white/70">
              {leaderboard.length} players
            </span>
          </div>

          <div className="space-y-4">
            {leaderboard.map((p, index) => {
              const accent =
                index === 0
                  ? "from-amber-400/85 via-orange-400/85 to-rose-400/85"
                  : index === 1
                  ? "from-slate-300/80 via-slate-400/80 to-slate-600/80"
                  : index === 2
                  ? "from-rose-400/80 via-fuchsia-400/80 to-purple-500/80"
                  : "from-cyan-500/50 via-blue-500/50 to-purple-500/50";

              return (
                <div
                  key={`${p.name}-${index}`}
                  className={`relative flex items-center justify-between overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-r ${accent} px-6 py-4 text-white shadow-[0_28px_90px_rgba(48,107,255,0.35)] backdrop-blur transition-transform hover:-translate-y-0.5`}
                >
                  <div className="flex items-center gap-4">
                    <div className="flex h-12 w-12 items-center justify-center rounded-full border border-white/30 bg-black/30 text-base font-semibold uppercase tracking-[0.3em]">
                      #{index + 1}
                    </div>
                    <div>
                      <p className="text-lg font-semibold uppercase tracking-[0.25em]">
                        {index === 0 && "🥇 "}
                        {index === 1 && "🥈 "}
                        {index === 2 && "🥉 "}
                        {p.name}
                      </p>
                      <p className="text-[11px] uppercase tracking-[0.4em] text-white/65">Score</p>
                    </div>
                  </div>
                  <p className="text-2xl font-semibold uppercase tracking-[0.35em] drop-shadow-[0_4px_18px_rgba(72,167,255,0.5)]">{p.score} pts</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>

      {isHost ? (
        <button
          onClick={onNextRound}
          className="relative flex w-full items-center justify-center gap-3 overflow-hidden rounded-full px-8 py-4 text-sm font-semibold uppercase tracking-[0.45em] text-white transition-all duration-300 bg-gradient-to-r from-fuchsia-500 via-blue-500 to-cyan-400 shadow-[0_30px_110px_rgba(72,167,255,0.55)] hover:shadow-[0_34px_125px_rgba(72,167,255,0.7)]"
        >
          <span className="text-lg">⟳</span>
          Deploy next round
        </button>
      ) : (
        <div className="relative overflow-hidden rounded-[30px] border border-white/12 bg-white/10 py-8 text-center text-white/70 shadow-[0_28px_90px_rgba(82,183,255,0.3)]">
          <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(63,169,255,0.25),_transparent_60%)]" />
          <div className="relative flex flex-col items-center gap-3">
            <span className="text-3xl animate-pulse">⏳</span>
            <p className="text-[11px] uppercase tracking-[0.45em]">Waiting for host</p>
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
      <div className="relative overflow-hidden rounded-[34px] border border-white/12 bg-gradient-to-r from-[#241108]/90 via-[#08030f]/96 to-[#09213a]/92 p-8 text-center shadow-[0_48px_140px_rgba(24,12,6,0.75)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(255,153,85,0.28),_transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.08)_0%,transparent_50%,rgba(82,183,255,0.22)_100%)]" />
        <div className="relative space-y-3">
          <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Grand finale</p>
          <h1 className="text-4xl font-semibold uppercase tracking-[0.3em] text-white sm:text-5xl">Tempo champions</h1>
        </div>
      </div>

      <div className="relative overflow-hidden rounded-[36px] border border-white/12 bg-gradient-to-br from-[#221033]/90 via-[#05030c]/96 to-[#0c253f]/92 p-10 shadow-[0_48px_140px_rgba(20,12,40,0.75)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_center,_rgba(255,162,89,0.22),_transparent_65%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(160deg,rgba(255,255,255,0.08)_0%,transparent_55%,rgba(255,118,200,0.2)_100%)]" />
        <div className="relative space-y-6">
          <h2 className="text-center text-2xl font-semibold uppercase tracking-[0.3em] text-white">Final leaderboard</h2>
          <div className="grid gap-4">
            {leaderboard.map((p, index) => {
              const tier =
                index === 0
                  ? "from-amber-400/85 via-orange-400/85 to-rose-400/85"
                  : index === 1
                  ? "from-slate-300/80 via-slate-400/80 to-slate-600/80"
                  : index === 2
                  ? "from-rose-400/80 via-fuchsia-400/80 to-purple-500/80"
                  : "from-cyan-500/40 via-blue-500/40 to-purple-500/40";

              return (
                <div
                  key={`${p.name}-${index}`}
                  className={`relative flex items-center justify-between overflow-hidden rounded-2xl border border-white/12 bg-gradient-to-r ${tier} px-6 py-5 text-white shadow-[0_34px_110px_rgba(82,183,255,0.35)] backdrop-blur transition-transform hover:-translate-y-0.5`}
                >
                  <div className="flex items-center gap-4">
                    <span className="text-3xl">
                      {index === 0 && "🥇"}
                      {index === 1 && "🥈"}
                      {index === 2 && "🥉"}
                    </span>
                    <div>
                      <p className="text-lg font-semibold uppercase tracking-[0.3em]">#{index + 1} {p.name}</p>
                      <p className="text-[11px] uppercase tracking-[0.4em] text-white/70">Total score</p>
                    </div>
                  </div>
                  <p className="text-3xl font-semibold uppercase tracking-[0.35em] drop-shadow-[0_6px_24px_rgba(255,163,89,0.45)]">{p.score} pts</p>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    </div>
  );
}

function LobbySuspenseFallback() {
  return (
    <GameLayout>
      <div className="relative flex min-h-[40vh] flex-col items-center justify-center gap-5 overflow-hidden rounded-[28px] border border-white/12 bg-white/5 px-8 py-12 text-center text-white/80 shadow-[0_36px_110px_rgba(6,18,45,0.55)]">
        <div className="pointer-events-none absolute inset-0 bg-[radial-gradient(circle_at_top,_rgba(63,169,255,0.25),_transparent_60%)]" />
        <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(150deg,rgba(255,255,255,0.08)_0%,transparent_55%,rgba(255,118,200,0.2)_100%)]" />
        <div className="relative space-y-3">
          <div className="mx-auto h-12 w-12 animate-spin rounded-full border-4 border-white/20 border-t-cyan-400" />
          <p className="text-[11px] uppercase tracking-[0.45em] text-white/60">Preparing lobby</p>
          <p className="text-sm text-white/70">Synchronizing playlists and player telemetry…</p>
        </div>
      </div>
    </GameLayout>
  );
}

export default function LobbyPage() {
  return (
    <Suspense fallback={<LobbySuspenseFallback />}>
      <GameClient />
    </Suspense>
  );
}
