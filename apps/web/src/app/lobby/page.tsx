"use client";
import { useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";

export default function Lobby() {

  const params = useSearchParams()
  const alias = params.get('nickname');
  const rc = params.get('roomcode');
  console.log(alias)
  console.log(rc)
  const [messages, setMessages] = useState<string[]>([]);
  const [players, setPlayers] = useState<Array<{id: string, name: string}>>([]);
  const socketRef = useRef<WebSocket | null>(null);

useEffect(() => {
  if (!rc || !alias) {
    console.log("Waiting for params...", rc, alias);
    return;
  }

  const url = `${process.env.NEXT_PUBLIC_WS_URL}/ws`;
  console.log("Connecting to", url);
  const ws = new WebSocket(url);
  socketRef.current = ws;

  ws.onopen = () => {
    console.log("WS open");
    ws.send(JSON.stringify({
      type: "join",
      payload: { roomCode: rc, nickname: alias }
    }));
  };

  ws.onmessage = (evt) => {
    console.log("WS message (raw):", evt.data);
    try {
      const msg = JSON.parse(evt.data);
      console.log("WS message (json):", msg);
      
      if (msg.type === "room_state") {
        console.log("Updating players to:", msg.payload.players);
        setPlayers(msg.payload.players);
        const names = msg.payload.players.map((p: any) => p.name).join(", ");
        setMessages(prev => [...prev, `players: ${names}`]);
      } else {
        setMessages(prev => [...prev, `other: ${evt.data}`]);
      }
    } catch (e) {
      console.warn("JSON parse failed; showing raw");
      setMessages(prev => [...prev, String(evt.data)]);
    }
  };

  ws.onerror = (e) => {
    console.error("WS error");
  };

  ws.onclose = (e) => {
    console.log("WS closed", e.code, e.reason);
  };

  return () => {
    console.log("Closing WS");
    ws.close();
  };
}, [rc, alias]);

  return (
    <div className="p-6 space-y-6">
      <h1 className="heading">Lobby</h1>
      
      <div>
        <h2 className="text-xl font-semibold mb-4">Players</h2>
        <div className="space-y-3">
          {players.map((p) => (
            <div key={p.id} className="p-4 bg-gradient-to-r from-blue-500 to-purple-600 rounded-lg shadow-lg text-white">
              <p className="font-medium">{p.name}</p>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
