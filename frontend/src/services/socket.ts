import { io } from "socket.io-client";

const VITE_BACKEND_URL =
  import.meta.env.VITE_BACKEND_URL || "http://localhost:5000";

export const socket = io(VITE_BACKEND_URL);
