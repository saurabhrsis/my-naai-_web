// Shared live-update socket for the MyNaai web portal.
//
// The salon queue screen and the customer bookings screen used to each open
// their own socket.io connection with `transports: ['websocket']` and disconnect
// it on every unmount. That combination caused exactly the console failure
// "WebSocket is closed before the connection is established":
//   * React StrictMode mounts, unmounts and remounts every effect, so the
//     fresh WebSocket was killed mid-handshake on the very first mount, and
//   * websocket-only transport has no polling fallback, so any network path
//     that cannot upgrade to WebSocket (proxies, captive portals, some
//     corporate networks) failed forever with reconnect spam.
// The queue screen also connected straight to the production API host in local
// development, bypassing the Vite `/socket.io` ws proxy on the same origin.
//
// This module keeps ONE shared connection per logged-in identity — the same
// approach as the mobile app's global NotificationContext socket — and re-joins
// every room after a reconnect. Transport order is socket.io's resilient
// default: start with polling, then upgrade to WebSocket when supported.
import { io } from 'socket.io-client';
import { getServerUrl } from './api';

const JOIN_EVENT = { salon: 'join_salon', user: 'join_user' };

let current = null;

function teardown() {
  if (!current) return;
  current.socket.removeAllListeners();
  current.socket.disconnect();
  current = null;
}

function ensureSocket(identity) {
  if (current && current.identity === identity) {
    // Replace a connection that gave up reconnecting the next time a screen
    // actually needs live updates again.
    if (!current.socket.connected && !current.socket.active) teardown();
    if (current) return current;
  }
  teardown();
  const socket = io(getServerUrl() || undefined, {
    // Polling first keeps live updates working where the WebSocket upgrade is
    // blocked; the client still upgrades to WebSocket whenever it can.
    transports: ['polling', 'websocket'],
    upgrade: true,
    reconnection: true,
    reconnectionAttempts: 10,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 8000,
    timeout: 20000,
  });
  current = { identity, socket, rooms: new Map() };
  // Rooms must be re-joined after every (re)connect: the server drops room
  // membership when the previous connection dies.
  socket.on('connect', () => {
    if (current?.socket !== socket) return;
    for (const room of current.rooms.values()) socket.emit(JOIN_EVENT[room.scope], String(room.id));
  });
  return current;
}

// Subscribe one screen to a live room event. Returns its own cleanup; calling
// it never disconnects the shared socket, so React StrictMode remounts and
// screen-to-screen navigation reuse the same healthy connection.
export function subscribeToLiveUpdates({ scope, id, event, handler }) {
  if (!id || !JOIN_EVENT[scope] || !event || typeof handler !== 'function') return () => {};
  const identity = `${scope}:${id}`;
  const state = ensureSocket(identity);
  const roomKey = `${scope}:${id}`;
  let room = state.rooms.get(roomKey);
  if (!room) {
    room = { scope, id, handlers: new Set() };
    state.rooms.set(roomKey, room);
  }
  room.handlers.add(handler);
  state.socket.on(event, handler);
  if (state.socket.connected) state.socket.emit(JOIN_EVENT[scope], String(id));
  return () => {
    if (!current || current.identity !== identity) return;
    const activeRoom = current.rooms.get(roomKey);
    if (activeRoom) {
      activeRoom.handlers.delete(handler);
      if (!activeRoom.handlers.size) current.rooms.delete(roomKey);
    }
    current.socket.off(event, handler);
  };
}

// Called on logout/session expiry so the next session starts a fresh socket.
export function resetLiveUpdatesSocket() {
  teardown();
}
