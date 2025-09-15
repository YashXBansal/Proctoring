import { useState, useEffect, useRef } from "react";
import { socket } from "./services/socket";

interface Alert {
  message: string;
  type: string;
  timestamp: string;
}

function App() {
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const videoRef = useRef<HTMLVideoElement>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);

  // --- MANDATORY AUDIO FIX: States for UI feedback only, no user control ---
  const [isAudioLive, setIsAudioLive] = useState(false);
  const audioContextRef = useRef<AudioContext | null>(null);

  useEffect(() => {
    // Standard connection listeners
    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
    }
    function onProctoringAlert(alert: Omit<Alert, "timestamp">) {
      const newAlert: Alert = {
        ...alert,
        timestamp: new Date().toLocaleTimeString(),
      };
      setAlerts((prevAlerts) => [newAlert, ...prevAlerts]);
    }

    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("proctoring_alert", onProctoringAlert);
    socket.connect();

    startMediaStreams();

    const frameIntervalId = setInterval(sendFrame, 500);

    return () => {
      socket.off("connect", onConnect);
      socket.off("disconnect", onDisconnect);
      socket.off("proctoring_alert", onProctoringAlert);
      socket.disconnect();
      clearInterval(frameIntervalId);
      if (
        audioContextRef.current &&
        audioContextRef.current.state !== "closed"
      ) {
        audioContextRef.current.close();
      }
    };
  }, []);

  const startMediaStreams = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      if (videoRef.current) {
        videoRef.current.srcObject = stream;
      }
      // --- MANDATORY AUDIO FIX: Audio processing starts automatically ---
      processAudio(stream);
    } catch (error) {
      console.error("Error accessing media devices:", error);
    }
  };

  const processAudio = (stream: MediaStream) => {
    setIsAudioLive(true); // For UI feedback
    const audioContext = new window.AudioContext();
    audioContextRef.current = audioContext;
    const source = audioContext.createMediaStreamSource(stream);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const bufferLength = analyser.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    source.connect(analyser);

    const NOISE_THRESHOLD = 40;
    let cooldown = false;

    const detectNoise = () => {
      analyser.getByteFrequencyData(dataArray);
      const average =
        dataArray.reduce((acc, val) => acc + val, 0) / bufferLength;

      if (average > NOISE_THRESHOLD && !cooldown) {
        socket.emit("audio_event", {
          message: "Potential background noise or speech detected.",
        });
        cooldown = true;
        setTimeout(() => {
          cooldown = false;
        }, 5000); // Frontend cooldown to prevent spamming emits
      }
      requestAnimationFrame(detectNoise);
    };
    detectNoise();
  };

  const sendFrame = () => {
    if (!socket.connected || !videoRef.current || !canvasRef.current) return;
    const video = videoRef.current;
    const canvas = canvasRef.current;
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    const context = canvas.getContext("2d");
    if (context) {
      context.drawImage(video, 0, 0, canvas.width, canvas.height);
      const imageData = canvas.toDataURL("image/jpeg", 0.7);
      socket.emit("video_frame", { image: imageData });
    }
  };

  return (
    <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center text-white font-sans p-4">
      <div className="w-full max-w-6xl">
        <header className="flex items-center justify-between mb-4">
          <h1 className="text-3xl font-bold">Proctoring Session</h1>
          <div className="flex items-center space-x-2">
            <div
              className={`w-3 h-3 rounded-full animate-pulse ${
                isConnected ? "bg-green-500" : "bg-red-500"
              }`}
            ></div>
            <p>{isConnected ? "Connected" : "Disconnected"}</p>
          </div>
        </header>
        <main className="grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-black rounded-lg shadow-lg border-2 border-gray-700 relative">
            <video
              ref={videoRef}
              autoPlay
              playsInline
              muted
              className="w-full h-full rounded-lg object-cover"
            ></video>
            <canvas ref={canvasRef} className="hidden"></canvas>
            {/* --- MANDATORY AUDIO FIX: Removed button, added static informational icon --- */}
            <div
              className="absolute bottom-4 left-4"
              title="Audio is being monitored for proctoring"
            >
              <span
                className={`p-2 rounded-full ${
                  isAudioLive ? "bg-gray-700/50" : "bg-red-700/50"
                }`}
              >
                {isAudioLive ? "🔊" : "🔇"}
              </span>
            </div>
          </div>

          <div className="col-span-1 bg-gray-800 p-4 rounded-lg shadow-lg h-[60vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">
              Event Log
            </h2>
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <p className="text-gray-400">No events detected yet.</p>
              ) : (
                alerts.map((alert, index) => (
                  <div
                    key={index}
                    className="bg-gray-700 p-3 rounded-md animate-fade-in"
                  >
                    <p className="font-bold text-red-400">
                      {alert.type.replace(/_/g, " ").toUpperCase()}
                    </p>
                    <p className="text-sm">{alert.message}</p>
                    <p className="text-xs text-gray-400 text-right">
                      {alert.timestamp}
                    </p>
                  </div>
                ))
              )}
            </div>
          </div>
        </main>
      </div>
    </div>
  );
}

export default App;
