"use client";
import { useState } from "react";
import { TextInput } from "./components/TextInput";
import { useRouter } from "next/navigation";

export default function Home() {
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [errors, setErrors] = useState<{ roomCode?: string; nickname?: string }>({});

  const handleRoomCode = (v: string) => {
    const cleaned = v.toUpperCase().replace(/[^A-Z0-9]/g, "").slice(0, 6);
    setRoomCode(cleaned);
    setErrors((e) => ({ ...e, roomCode: cleaned.length === 6 ? undefined : "6 characters required" }));
  };

  const handleNickname = (v: string) => {
    const trimmed = v.replace(/\s+/g, " ").trim().slice(0, 16);
    setNickname(trimmed);
    setErrors((e) => ({ ...e, nickname: trimmed.length >= 2 ? undefined : "Min 2 characters" }));
  };

  const router = useRouter();
  const canJoin = nickname && roomCode.length === 6 && !errors.nickname && !errors.roomCode;

  return (
    <main className="min-h-screen w-full flex items-center justify-center p-6">
      <div className="w-full max-w-lg space-y-8">
        <div className="flex items-center justify-between">
          <h1 className="
    inline-flex items-center gap-2
    whitespace-nowrap leading-none tracking-tight
    text-4xl sm:text-5xl md:text-6xl
    font-bold bg-gradient-to-r from-blue-400 via-cyan-600 to-purple-800
    bg-clip-text text-transparent
  ">
            🎵 Join a Room 🎵
          </h1>
          {!!roomCode && (
            <span className="text-sm bg-gray-800 border-2 border-cyan-500 text-cyan-400 px-4 py-2 rounded-lg font-bold shadow-lg shadow-cyan-500/30">
              {roomCode}
            </span>
          )}
        </div>

        <div className="bg-gray-800/50 backdrop-blur-sm p-6 rounded-2xl shadow-2xl border border-gray-700 space-y-6">
          <div className="space-y-4">
            <TextInput
              id="nickname"
              label="Nickname"
              value={nickname}
              onChange={handleNickname}
              placeholder="e.g. Tom"
              maxLength={16}
              error={errors.nickname}
            />

            <TextInput
              id="roomCode"
              label="Room Code"
              value={roomCode}
              onChange={handleRoomCode}
              placeholder="ABC123"
              maxLength={6}
              error={errors.roomCode}
            />
          </div>

          <button
            className={`w-full py-4 rounded-xl text-white text-lg font-bold transition-all shadow-lg
              ${canJoin
                ? "bg-gradient-to-r from-cyan-500 to-blue-600 hover:from-cyan-600 hover:to-blue-700 hover:scale-[1.02] shadow-cyan-500/50"
                : "bg-gray-700 cursor-not-allowed opacity-50"}`}
            disabled={!canJoin}
            onClick={() => router.push(`/lobby?nickname=${nickname}&roomcode=${roomCode}`)}
          >
            Join Room
          </button>

          <div className="text-xs text-gray-400 text-center">
            Use your 6-character room code. Nickname 2–16 characters.
          </div>
        </div>


        
      </div>
    </main>
  );
}
