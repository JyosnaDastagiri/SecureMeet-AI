'use client';
import { io } from 'socket.io-client';
import { API_URL, tokenStore } from './api';

/**
 * Opens a lightweight authenticated socket that only listens for "invitation:new" push events
 * (used on the Invitations page). Returns a cleanup function that closes the socket.
 * The meeting room uses its own socket inside useMeetingRoom.
 */
export function getSharedSocketListener(onInvitation: () => void): () => void {
  const token = tokenStore.get();
  if (!token) return () => undefined;
  const socket = io(API_URL, { auth: { token }, transports: ['websocket', 'polling'], reconnectionAttempts: 3 });
  socket.on('invitation:new', onInvitation);
  return () => {
    socket.off('invitation:new', onInvitation);
    socket.disconnect();
  };
}
