"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

// ---- Types ----
interface Player {
  id: string;
  name: string;
}

type GameState = "lobby" | "playing" | "results";

interface LobbyViewProps {
  players: Player[];
  roomCode: string;
  onStart: () => void;
  myPlayerId: string;
  hostId: string;
  gameModes: string[];
  selectedMode: string;
  onSelectMode: (modeName: string) => void;
}

interface PlayingViewProps {
  songUrl: string;
  timeRemaining: number;
  onSubmitAnswer: (artist: string, title: string) => void;
}

interface ResultsViewProps {
  leaderboard: Player[];
}

export default function GameClient() {
  const [gameState, setGameState] = useState<GameState>("lobby");
  const [players, setPlayers] = useState<Player[]>([]);
  const socketRef = useRef<WebSocket | null>(null);
  const [songData, setSongData] = useState<{ url: string; title: string; artist: string }>({ url: "", title: "", artist: "" });
  const [timeRemaining, setTimeRemaining] = useState<number>(20);
  const [leaderboard, setLeaderboard] = useState<Player[]>([]);
  const params = useSearchParams();
  const rc = params.get("roomcode") ?? "";
  const alias = params.get("nickname") ?? "";
  const [hostId, setHostId] = useState<string>("");
  const [myPlayerId, setMyPlayerId] = useState<string>("")
  const [gameModes, setGameModes] = useState<string[]>([])
  const [modeDescriptions, setDescriptions] = useState<string[]>([])
  const [selectedGameMode, setSelectedGameMode] = useState<string>("");

 
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
      console.log(" Recieved:", evt.data)
      try {
        const msg = JSON.parse(evt.data);
        switch (msg.type) {
          case "joined": {
            setMyPlayerId(msg.payload?.playerId )
            setMyPlayerId(msg.payload?.playerId || "");
            setHostId(msg.payload?.hostId || "");
            console.log("Joined! I am:", msg.payload?.playerId);
            console.log("👑 Host is:", msg.payload?.hostId);
            break;
          }
          case "game_modes": {
            console.log("Recieved Game_modes")
            setGameModes(msg.payload?.name || []);
            setDescriptions(msg.payload?.description || []);
            break; 
          }
          case "game_state_changed": {
            console.log("Game state chagned")
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
            setTimeRemaining(msg.payload?.duration ?? 20);
            setGameState("playing");
            break;
          }
          case "mode_selected": {
            console.log("Received Mode Selection Update");
            setDescriptions([]); // Clear previous descriptions if necessary
            setSelectedGameMode(msg.payload?.selectedMode || "");
             break;
          }
         
          case "round_results": {
            setLeaderboard(msg.payload?.leaderboard ?? []);
            setGameState("results");
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


if (gameState === "lobby") {
    // ...
    return <LobbyView 
        players={players} 
        roomCode={rc} 
        onStart={handleStartGame} 
        myPlayerId={myPlayerId} 
        hostId={hostId} 
        gameModes={gameModes} 
        selectedMode={selectedGameMode} 
        onSelectMode={handleSelectMode} 
    />;
}
  if (gameState === "playing") {
    return (
      <PlayingView
        songUrl={songData.url}
        timeRemaining={timeRemaining}
        onSubmitAnswer={handleSubmitAnswer}
      />
    );
  }
  if (gameState === "results") {
    return <ResultsView leaderboard={leaderboard} />;
  }

  
  
  
  return (
    <div className="p-6">
      <p>Unknown state. Returning to lobby…</p>
    </div>
  );
}

function LobbyView({ players, roomCode, onStart, myPlayerId, hostId, gameModes, selectedMode, onSelectMode }: LobbyViewProps) {
  const [isDropdownOpen, setIsDropdownOpen] = useState(false);

  const isHost = myPlayerId === hostId;
  const canStartGame = players.length > 0 && selectedMode !== "";
  const buttonText = selectedMode || (isHost ? "Select Game Mode" : "Waiting for Host to Select Mode...");

  const handleModeSelection = (modeName: string) => {
    if (isHost) {
      onSelectMode(modeName); // Send mode back up to GameClient state via WebSocket
      setIsDropdownOpen(false);
    }
  };
  
  const toggleDropdown = () => {
    if (isHost) {
      setIsDropdownOpen(prev => !prev);
    }
  };

  return (
    <div className="p-6 space-y-6">
      {/* Header and Room Code */}
      <div className="flex items-center justify-between">
        <h1 className="heading">Lobby</h1>
        <span className="text-sm bg-gray-800 text-white px-3 py-1 rounded">Room: {roomCode}</span>
      </div>

      {/* Players List Display */}
      <div>
        <h2 className="text-xl font-semibold mb-4">Players</h2>
        <div className="space-y-3">
          {players.map((p) => (
            <div
              key={p.id}
              className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg text-white"
            >
              <p className="font-medium">{p.name} {p.id === hostId && " 👑"}</p>
            </div>
          ))}
          {players.length === 0 && (
            <div className="text-gray-500 text-sm">Waiting for players to join…</div>
          )}
        </div>
      </div>

      {/* Game Mode Selection Dropdown */}
      <div className="w-full relative">
        <button 
          id="dropdownDefaultButton" 
          onClick={toggleDropdown} 
          disabled={!isHost} 
          className={`w-full text-white ${isHost ? 'bg-blue-700 hover:bg-blue-800 focus:ring-blue-300' : 'bg-gray-600 disabled:opacity-50 cursor-default'} 
                     focus:ring-4 focus:outline-none font-medium rounded-lg text-sm px-5 py-2.5 text-center inline-flex items-center dark:bg-blue-600 dark:hover:bg-blue-700 dark:focus:ring-blue-800`} 
          type="button"
        >
          {buttonText} 
          <svg className="w-2.5 h-2.5 ms-3" aria-hidden="true" xmlns="http://www.w3.org/2000/svg" fill="none" viewBox="0 0 10 6">
            <path stroke="currentColor" strokeLinecap="round" strokeLinejoin="round" strokeWidth="2" d="m1 1 4 4 4-4"/>
          </svg>
        </button>

        {isDropdownOpen && isHost && (
          <div 
            id="dropdown" 
            className="absolute z-10 mt-1 w-full bg-white divide-y divide-gray-100 rounded-lg shadow-lg dark:bg-gray-700"
          >
            <ul className="py-2 text-sm text-gray-700 dark:text-gray-200" aria-labelledby="dropdownDefaultButton">
              {gameModes.map((modeName) => (
                <li key={modeName}>
                  <a 
                    href="#" 
                    onClick={(e) => {
                      e.preventDefault();
                      handleModeSelection(modeName);
                    }}
                    className="block px-4 py-2 hover:bg-gray-100 dark:hover:bg-gray-600 dark:hover:text-white"
                  >
                    {modeName}
                  </a>
                </li>
              ))}
            </ul>
          </div>
        )}
      </div>

      {/* Start Game Button / Wait Message */}
      {isHost ? (
        <button 
          onClick={onStart} 
          className="w-full btn btn-cyan disabled:opacity-50" 
          disabled={!canStartGame} 
        >
          Start Game
        </button>
      ) : (
        <div className="text-center text-gray-400">
          Waiting for host to start the game...
        </div> 
      )}
    </div> 
  );
}
function PlayingView({ songUrl, timeRemaining, onSubmitAnswer }: PlayingViewProps) {
  const [artistInput, setArtistInput] = useState("");
  const [songInput, setSongInput] = useState("");

  const handleSubmit = () => {
    if (!artistInput || !songInput) return;
    onSubmitAnswer(artistInput.trim(), songInput.trim());
    setArtistInput("");
    setSongInput("");
  };

  const canSubmit = Boolean(artistInput && songInput && timeRemaining > 0);

  return (
    <div className="p-6 space-y-4">
      <h1 className="heading">Guess the Song</h1>

      <div className="bg-gray-800 p-4 rounded-lg">
        <audio src={songUrl} controls className="w-full" />
      </div>

      <div className="text-2xl font-bold text-center">
        Time: <span className="text-cyan-400">{timeRemaining}s</span>
      </div>

      <div className="space-y-3">
        <input
          type="text"
          value={artistInput}
          onChange={(e) => setArtistInput(e.target.value)}
          placeholder="Artist"
          className="w-full p-2 rounded bg-gray-700 text-white"
        />
        <input
          type="text"
          value={songInput}
          onChange={(e) => setSongInput(e.target.value)}
          placeholder="Song Title"
          className="w-full p-2 rounded bg-gray-700 text-white"
        />
      </div>

      <button onClick={handleSubmit} disabled={!canSubmit} className="w-full btn btn-cyan disabled:opacity-50">
        Submit
      </button>
    </div>
  );
}

function ResultsView({ leaderboard }: ResultsViewProps) {
  return (
    <div className="p-6 space-y-6">
      <h1 className="heading">Results</h1>

      <div>
        <h2 className="text-xl font-semibold mb-4">Leaderboard</h2>
        <div className="space-y-3">
          {leaderboard.map((p, index) => (
            <div
              key={p.id}
              className="p-4 bg-gradient-to-r from-green-500 to-blue-600 rounded-lg shadow-lg text-white flex justify-between"
            >
              <p className="font-medium">#{index + 1} {p.name} </p>
            </div>
          ))}
          {leaderboard.length === 0 && (
            <div className="text-gray-500 text-sm">No scores yet.</div>
          )}
        </div>
      </div>
    </div>
  );
}
