import { useEffect, useRef } from "react";
import { io, type Socket } from "socket.io-client";
import { API_URL } from "./api";

export function useSocietySocket(societyId: string | null | undefined, handlers: Record<string, (payload: any) => void>) {
  const socketRef = useRef<Socket | null>(null);
  const handlersRef = useRef(handlers);
  handlersRef.current = handlers;

  useEffect(() => {
    if (!societyId) return;
    const socket = io(API_URL, { transports: ["polling", "websocket"] });
    socketRef.current = socket;
    socket.emit("join-society", societyId);

    const bound: [string, (p: any) => void][] = Object.entries(handlersRef.current).map(([event, fn]) => {
      const wrapped = (payload: any) => fn(payload);
      socket.on(event, wrapped);
      return [event, wrapped];
    });

    return () => {
      bound.forEach(([event, wrapped]) => socket.off(event, wrapped));
      socket.disconnect();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [societyId]);
}
