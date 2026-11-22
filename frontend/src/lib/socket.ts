import { io } from "socket.io-client";

// ONE shared connection for the whole app. `autoConnect: false` means nothing connects until
// a page asks for it (the seat map calls socket.connect() when it opens).
// `withCredentials` makes the browser send our login cookie, so the server knows who we are.
// If VITE_API_URL is not set, socket.io connects to the page's own address.
export const socket = io(import.meta.env.VITE_API_URL, {
  withCredentials: true,
  autoConnect: false,
});
