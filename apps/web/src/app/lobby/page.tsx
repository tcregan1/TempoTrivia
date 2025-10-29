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

interface PlayingViewProps {
  songUrl: string;
  timeRemaining: number;
  onSubmitAnswer: (artist: string, title: string) => void;
  reveal?: { title: string; artist: string; artistImageUrl?: string | null } | null;
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
    <div className="min-h-screen bg-gradient-to-br from-gray-900 via-black to-gray-900">
      <div className="max-w-4xl mx-auto p-6">
        {children}
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
    <div className="space-y-10">
      <div className="flex items-center justify-between">
        <h1 className="text-5xl font-bold bg-gradient-to-r from-blue-400 via-cyan-400 to-purple-600 bg-clip-text text-transparent">
          🎮 Lobby
        </h1>
        <span className="text-sm bg-gray-800 border-2 border-cyan-500 text-cyan-400 px-4 py-2 rounded-lg font-bold shadow-lg shadow-cyan-500/30">
          Room: {roomCode}
        </span>
      </div>

      <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-700">
        <h2 className="text-2xl font-semibold mb-4 text-white">Players ({players.length})</h2>
        <div className="space-y-3">
          {players.map((p) => (
            <div
              key={p.id}
              className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-xl shadow-lg text-white hover:scale-[1.02] transition-transform"
            >
              <p className="font-medium text-lg">{p.name} {p.id === hostId && " 👑"}</p>
            </div>
          ))}
          {players.length === 0 && (
            <div className="text-gray-400 text-center py-4">Waiting for players to join…</div>
          )}
        </div>
      </div>

      <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-700">
        <h2 className="text-2xl font-semibold mb-4 text-white">Game Mode</h2>

        {selectedMode ? (
          <div className="space-y-3">
            <div className="p-4 bg-gradient-to-r from-cyan-500 to-blue-600 rounded-xl text-white shadow-lg ring-2 ring-white/10">
              <div className="flex items-center justify-between">
                <div>
                  <p className="text-sm text-cyan-100 mb-1">Selected Mode</p>
                  <p className="text-xl font-bold">🎵 {selectedMode}</p>
                </div>
                {isHost && (
                  <button
                    onClick={() => setIsDropdownOpen(true)}
                    className="px-4 py-2 bg-white/20 hover:bg-white/30 rounded-lg text-sm font-medium transition-all"
                  >
                    Change
                  </button>
                )}
              </div>
            </div>

            {isDropdownOpen && (
              <>
                <button
                  aria-label="Close mode menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div className="z-50 relative mt-3">
                  <div className="rounded-xl border border-cyan-500/40 bg-gray-950/90 backdrop-blur shadow-2xl ring-1 ring-cyan-300/20 overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600" />
                    <ul role="listbox" className="max-h-64 overflow-auto">
                      {gameModes.length > 0 ? (
                        gameModes.map((modeName) => (
                          <li key={modeName} className="border-b border-white/5 last:border-none">
                            <button
                              role="option"
                              onClick={() => handleModeSelection(modeName)}
                              className="w-full text-left px-6 py-3 text-white hover:bg-cyan-500/20 transition-colors"
                            >
                              <span className="font-medium">🎵 {modeName}</span>
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="px-6 py-4 text-gray-400 text-center">No game modes available</li>
                      )}
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        ) : (
          <div>
            <button
              onClick={toggleDropdown}
              disabled={!isHost}
              className={`w-full py-4 rounded-xl text-white text-lg font-bold transition-all shadow-lg ${
                isHost
                  ? 'bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 hover:scale-[1.02] shadow-cyan-500/50'
                  : 'bg-gray-700 cursor-not-allowed opacity-50'
              }`}
              type="button"
            >
              {isHost ? "🎵 Select a Game Mode" : "⏳ Waiting for host to select mode..."}
              {isHost && <span className="ml-2">▼</span>}
            </button>

            {isDropdownOpen && isHost && (
              <>
                <button
                  aria-label="Close mode menu"
                  className="fixed inset-0 z-40 cursor-default"
                  onClick={() => setIsDropdownOpen(false)}
                />
                <div className="z-50 relative mt-3">
                  <div className="rounded-xl border border-cyan-500/40 bg-gray-950/90 backdrop-blur shadow-2xl ring-1 ring-cyan-300/20 overflow-hidden">
                    <div className="h-1 bg-gradient-to-r from-cyan-400 via-blue-500 to-purple-600" />
                    <ul role="listbox" className="max-h-64 overflow-auto">
                      {gameModes.length > 0 ? (
                        gameModes.map((modeName) => (
                          <li key={modeName} className="border-b border-white/5 last:border-none">
                            <button
                              role="option"
                              onClick={() => handleModeSelection(modeName)}
                              className="w-full text-left px-6 py-3 text-white hover:bg-cyan-500/20 transition-colors"
                            >
                              <span className="font-medium">🎵 {modeName}</span>
                            </button>
                          </li>
                        ))
                      ) : (
                        <li className="px-6 py-4 text-gray-400 text-center">No game modes available</li>
                      )}
                    </ul>
                  </div>
                </div>
              </>
            )}
          </div>
        )}
      </div>

      {isHost && (
        <div className="mt-10 bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-700">
          <h2 className="text-2xl font-semibold mb-4 text-white">Audio Settings</h2>
          <label className="flex items-start gap-4 text-white cursor-pointer hover:bg-gray-700/30 p-4 rounded-lg transition-all group">
            <input
              type="checkbox"
              checked={hostOnlyAudio}
              onChange={(e) => onAudioModeToggle(e.target.checked)}
              className="w-6 h-6 mt-1 accent-cyan-500 cursor-pointer"
            />
            <div className="flex-1">
              <div className="flex items-center gap-2 mb-2">
                <span className="text-2xl">🔊</span>
                <span className="font-bold text-lg">In-Person Mode</span>
                {hostOnlyAudio && (
                  <span className="text-xs bg-green-500 text-white px-2 py-1 rounded-full">
                    Active
                  </span>
                )}
              </div>
              <p className="text-sm text-gray-400 leading-relaxed">
                Play audio only on your device. Perfect for parties where everyone is in the same room listening together.
              </p>
              {!hostOnlyAudio && (
                <p className="text-xs text-cyan-400 mt-2">
                  💡 When disabled, audio plays on all devices (great for remote play)
                </p>
              )}
            </div>
          </label>
        </div>
      )}

      {isHost ? (
        <button 
          onClick={onStart} 
          disabled={!canStartGame}
          className="w-full py-5 bg-gradient-to-r from-green-500 to-emerald-600 hover:from-green-600 hover:to-emerald-700 text-white text-xl font-bold rounded-xl disabled:opacity-50 disabled:cursor-not-allowed transform hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-green-500/50 relative overflow-hidden group"
        >
          <span className="relative z-10"> Start Game</span>
          {!canStartGame && (
            <span className="block text-sm font-normal mt-1">
              {!selectedMode ? "Select a game mode first" : "Waiting for players..."}
            </span>
          )}
        </button>
      ) : (
        <div className="text-center text-gray-400 py-6 bg-gray-800/30 rounded-xl border border-gray-700">
          <div className="text-4xl mb-2 animate-pulse">⏳</div>
          <p className="font-medium">Waiting for host to start the game...</p>
        </div>
      )}
    </div>
  );
}


// ---- Playing View ----
function PlayingView({ songUrl, timeRemaining, onSubmitAnswer, reveal }: PlayingViewProps) {
  const [artistInput, setArtistInput] = useState("");
  const [songInput, setSongInput] = useState("");
  const [hasSubmitted, setHasSubmitted] = useState(false);
  const [revealCountdown, setRevealCountdown] = useState(0);
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
  }, [songUrl]);

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
    onSubmitAnswer(artistInput.trim(), songInput.trim());
    setHasSubmitted(true);
  };

  const progressPercentage = (timeRemaining / 30) * 100;
  const revealProgress = (revealCountdown / REVEAL_DURATION) * 100;
  const canSubmit = Boolean(!isRevealPhase && artistInput && songInput && timeRemaining > 0 && !hasSubmitted);

  const getProgressColor = () => {
    if (timeRemaining > 20) return "from-green-500 to-emerald-500";
    if (timeRemaining > 10) return "from-yellow-500 to-orange-500";
    return "from-red-500 to-pink-500";
  };

  const getTimerColor = () => {
    if (timeRemaining > 20) return "text-green-400";
    if (timeRemaining > 10) return "text-yellow-400";
    return "text-red-400";
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
              </div>
            </div>
          </div>
        </div>
      ) : (
        <>
          <div className="flex justify-center gap-2 py-6">
            <div className="h-8 w-2 animate-pulse rounded-full bg-cyan-500" style={{ animationDelay: "0ms" }}></div>
            <div className="h-12 w-2 animate-pulse rounded-full bg-cyan-400" style={{ animationDelay: "150ms" }}></div>
            <div className="h-6 w-2 animate-pulse rounded-full bg-cyan-500" style={{ animationDelay: "300ms" }}></div>
            <div className="h-10 w-2 animate-pulse rounded-full bg-cyan-400" style={{ animationDelay: "450ms" }}></div>
            <div className="h-8 w-2 animate-pulse rounded-full bg-cyan-500" style={{ animationDelay: "600ms" }}></div>
          </div>

          <div className="rounded-2xl border border-gray-700 bg-gray-800/50 p-6 shadow-2xl backdrop-blur-sm">
            <div className="mb-3 flex items-center justify-between">
              <span className="font-medium text-gray-400">Time Remaining</span>
              <span className={`text-5xl font-bold ${getTimerColor()} transition-colors duration-300`}>
                {timeRemaining}s
              </span>
            </div>
            <div className="h-6 w-full overflow-hidden rounded-full bg-gray-700 shadow-inner">
              <div
                className={`h-full bg-gradient-to-r ${getProgressColor()} shadow-lg transition-all duration-1000 ease-linear`}
                style={{ width: `${progressPercentage}%` }}
              />
            </div>
          </div>

          <div className="space-y-4">
            <div className="relative">
              <span className="absolute left-4 top-4 text-2xl">🎤</span>
              <input
                type="text"
                value={artistInput}
                onChange={(e) => setArtistInput(e.target.value)}
                placeholder="Artist Name"
                disabled={hasSubmitted}
                className="w-full rounded-xl border-2 border-gray-700 bg-gray-800 pl-14 pr-4 py-4 text-lg text-white shadow-lg transition-all
                       placeholder-gray-500 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/30
                       disabled:cursor-not-allowed disabled:opacity-50 hover:border-gray-600 outline-none"
              />
            </div>

            <div className="relative">
              <span className="absolute left-4 top-4 text-2xl">🎵</span>
              <input
                type="text"
                value={songInput}
                onChange={(e) => setSongInput(e.target.value)}
                placeholder="Song Title"
                disabled={hasSubmitted}
                className="w-full rounded-xl border-2 border-gray-700 bg-gray-800 pl-14 pr-4 py-4 text-lg text-white shadow-lg transition-all
                       placeholder-gray-500 focus:border-cyan-500 focus:ring-4 focus:ring-cyan-500/30
                       disabled:cursor-not-allowed disabled:opacity-50 hover:border-gray-600 outline-none"
              />
            </div>
          </div>

          {!hasSubmitted ? (
            <button
              onClick={handleSubmit}
              disabled={!canSubmit}
              className="w-full transform rounded-xl bg-gradient-to-r from-cyan-500 to-blue-600 py-5 text-xl font-bold text-white shadow-2xl shadow-cyan-500/50 transition-all
                     hover:scale-[1.02] hover:from-cyan-600 hover:to-blue-700 hover:shadow-cyan-500/70 active:scale-[0.98]
                     disabled:cursor-not-allowed disabled:opacity-50"
            >
              Submit Answer
            </button>
          ) : (
            <div className="w-full animate-pulse rounded-xl bg-gradient-to-r from-green-500 to-emerald-600 p-5 text-center text-xl font-bold text-white shadow-2xl shadow-green-500/50">
              ✓ Answer Submitted! Waiting for round to end...
            </div>
          )}
        </>
      )}
    </div>
  );
}

// ---- Leaderboard View ----
function LeaderboardView({ leaderboard, currentRound, totalRounds, isHost, onNextRound }: LeaderboardViewProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-5xl font-bold text-center bg-gradient-to-r from-yellow-400 via-orange-400 to-red-500 bg-clip-text text-transparent">
        🏆 Round {currentRound} / {totalRounds}
      </h1>

      <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-700">
        <h2 className="text-2xl font-semibold mb-6 text-white">Leaderboard</h2>
        <div className="space-y-3">
          {leaderboard.map((p, index) => (
            <div
              key={index}
              className="p-4 bg-gradient-to-r from-green-500 to-blue-600 rounded-xl shadow-lg text-white 
                         flex justify-between items-center hover:scale-[1.02] transition-transform"
            >
              <p className="font-bold text-lg">
                {index === 0 && "🥇 "}
                {index === 1 && "🥈 "}
                {index === 2 && "🥉 "}
                #{index + 1} {p.name}
              </p>
              <p className="font-bold text-2xl">{p.score} pts</p>
            </div>
          ))}
        </div>
      </div>

      {isHost ? (
        <button 
          onClick={onNextRound} 
          className="w-full py-5 bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 
                     hover:to-blue-700 text-white text-xl font-bold rounded-xl transform 
                     hover:scale-[1.02] active:scale-[0.98] transition-all shadow-2xl shadow-cyan-500/50"
        >
            Next Round
        </button>
      ) : (
        <div className="text-center text-gray-400 py-4 bg-gray-800/30 rounded-xl border border-gray-700">
          Waiting for host to start next round...
        </div>
      )}
    </div>
  );
}

// ---- Final Results View ----
function FinalResultsView({ leaderboard }: ResultsViewProps) {
  return (
    <div className="space-y-6">
      <h1 className="text-6xl font-bold text-center bg-gradient-to-r from-yellow-300 via-yellow-500 to-orange-500 bg-clip-text text-transparent animate-pulse">
        🏆 Final Results 🏆
      </h1>

      <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-yellow-500/50">
        <h2 className="text-2xl font-semibold mb-6 text-white text-center">Champion Leaderboard</h2>
        <div className="space-y-4">
          {leaderboard.map((p, index) => (
            <div
              key={index}
              className={`p-6 rounded-xl shadow-2xl text-white flex justify-between items-center
                         transform hover:scale-[1.02] transition-all
                         ${index === 0 ? 'bg-gradient-to-r from-yellow-400 to-orange-500 shadow-yellow-500/50' :
                           index === 1 ? 'bg-gradient-to-r from-gray-300 to-gray-500' :
                           index === 2 ? 'bg-gradient-to-r from-orange-400 to-orange-600' :
                           'bg-gradient-to-r from-blue-500 to-purple-600'
                         }`}
            >
              <p className="font-bold text-xl">
                {index === 0 && "🥇 "}
                {index === 1 && "🥈 "}
                {index === 2 && "🥉 "}
                #{index + 1} {p.name}
              </p>
              <p className="font-bold text-3xl">{p.score} pts</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}