"use client";
import { useEffect, useRef, useState } from "react";

export default function Lobby() {
  const [messages, setMessages] = useState<string[]>([]);
  const socketRef = useRef<WebSocket | null>(null);

  useEffect(() => {
    const url = `${process.env.NEXT_PUBLIC_WS_URL}/ws`;
    console.log("Connecting to", url);
    const ws = new WebSocket(url);
    socketRef.current = ws;

    ws.onopen = () => {
      console.log("WS open");
      ws.send(JSON.stringify({
        type: "join",
        payload: { roomCode: "ABC123", nickname: "Matthew" }
      }));
    };

    ws.onmessage = (evt) => {
      console.log("WS message (raw):", evt.data);
      try {
        const msg = JSON.parse(evt.data);
        console.log("WS message (json):", msg);
        if (msg.type === "room_state") {
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
      console.error("WS error", e);
    };

    ws.onclose = (e) => {
      console.log("WS closed", e.code, e.reason);
    };

    return () => {
      console.log("Closing WS");
      ws.close();
    };
  }, []);

  return (
    <div className="p-6 space-y-4">
      <h1 className="heading">Lobby</h1>
      <ul className="list-disc pl-6">
        {messages.map((m, i) => <li key={i}>{m}</li>)}
      </ul>
    </div>
  );
}
