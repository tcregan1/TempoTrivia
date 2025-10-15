"use client";
import { useState } from "react";
import { TextInput } from "./components/TextInput";
import { useRouter } from 'next/navigation';

export default function Home() {
  const [roomCode, setRoomCode] = useState("");
  const [nickname, setNickname] = useState("");
  const [errors, setErrors] = useState<{ roomCode?: string; nickname?: string }>({});

  // Example: enforce uppercase & 6-char max for room code
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

  return (
    <div className="p-6 space-y-4">
      <h1 className="heading">Welcome</h1>

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


     <button 
  className="btn btn-cyan" 
  disabled={!nickname || roomCode.length !== 6}
  onClick={() => {
  router.push(`/lobby?nickname=${nickname}&roomcode=${roomCode}`);
}}
>
  Join Room
</button>
    </div>
  );
}


