import { useState, useEffect } from "react";
import { socket } from "./services/socket";

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);

  useEffect(() => {
    // --- Function to handle connection ---
    function onConnect() {
      console.log("Connected to the server!");
      setIsConnected(true);
    }

    // --- Function to handle disconnection ---
    function onDisconnect() {
      console.log("Disconnected from the server!");
      setIsConnected(false);
    }

    // --- Registering event listeners ---
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);

    // --- Attempt to connect ---
    // This is where the connection to the backend is initiated
    socket.connect();

    // --- Cleanup function ---
    // This runs when the component is unmounted
    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.disconnect();
    };
  }, []); // The empty dependency array ensures this effect runs only once

  return (
    <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center text-white font-sans">
      <div className="w-full max-w-4xl p-4">
        <h1 className="text-4xl font-bold text-center mb-2">
          Tutedude Video Proctoring
        </h1>
        <div className="flex items-center justify-center space-x-2 mb-6">
          <div
            className={`w-3 h-3 rounded-full ${
              isConnected ? "bg-green-500" : "bg-red-500"
            }`}
          ></div>
          <p className="text-lg">
            {isConnected ? "Connected" : "Disconnected"}
          </p>
        </div>

        {/* Placeholder for the video feed */}
        <div className="bg-black aspect-video w-full rounded-lg shadow-lg border-2 border-gray-700">
          {/* The video element will go here in the next phase */}
        </div>
      </div>
    </div>
  );
}

export default App;
