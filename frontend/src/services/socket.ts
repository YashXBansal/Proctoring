import { io } from "socket.io-client";

export const VITE_BACKEND_URL = import.meta.env.VITE_BACKEND_URL;

export const socket = io(VITE_BACKEND_URL);
