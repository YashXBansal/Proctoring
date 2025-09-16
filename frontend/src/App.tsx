// import { useState, useEffect, useRef } from "react";
// import { socket } from "./services/socket";

// interface Alert {
//   message: string;
//   type: string;
//   timestamp: string;
// }

// function App() {
//   const [isConnected, setIsConnected] = useState(socket.connected);
//   const [alerts, setAlerts] = useState<Alert[]>([]);
//   const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null);
//   const canvasRef = useRef<HTMLCanvasElement>(null);
//   const [sessionId, setSessionId] = useState<string | null>(null);
//   const [candidateName, setCandidateName] = useState<string>("");
//   const [isSessionStarted, setIsSessionStarted] = useState(false);
//   const [isRecording, setIsRecording] = useState(false);
//   const mediaRecorderRef = useRef<MediaRecorder | null>(null);
//   const recordedChunksRef = useRef<Blob[]>([]);
//   const [isCameraEnabled, setIsCameraEnabled] = useState(false);
//   const [isAudioLive, setIsAudioLive] = useState(false);
//   const mediaStreamRef = useRef<MediaStream | null>(null);
//   const [isVideoReady, setIsVideoReady] = useState(false);
//   const animationFrameRef = useRef<number | null>(null);
//   const audioContextRef = useRef<AudioContext | null>(null);

//   // Effect for handling socket events
//   useEffect(() => {
//     function onConnect() {
//       setIsConnected(true);
//     }
//     function onDisconnect() {
//       setIsConnected(false);
//       setIsSessionStarted(false);
//       setSessionId(null);
//     }
//     function onProctoringAlert(alert: Omit<Alert, "timestamp">) {
//       const newAlert: Alert = {
//         ...alert,
//         timestamp: new Date().toLocaleTimeString(),
//       };
//       setAlerts((prevAlerts) => [newAlert, ...prevAlerts]);
//     }
//     function onSessionStarted(data: { sessionId: string }) {
//       setSessionId(data.sessionId);
//       setIsSessionStarted(true);
//     }

//     socket.on("connect", onConnect);
//     socket.on("disconnect", onDisconnect);
//     socket.on("proctoring_alert", onProctoringAlert);
//     socket.on("session_started", onSessionStarted);

//     return () => {
//       socket.off("connect");
//       socket.off("disconnect");
//       socket.off("proctoring_alert");
//       socket.off("session_started");
//     };
//   }, []);

//   // Effect for sending video frames
//   useEffect(() => {
//     if (isSessionStarted && isVideoReady) {
//       const frameIntervalId = setInterval(sendFrame, 500);
//       return () => clearInterval(frameIntervalId);
//     }
//   }, [isSessionStarted, isVideoReady]);

//   // --- *** THE MAIN PREVIEW FIX IS HERE *** ---
//   // This simplified effect ensures the video stream is attached and played
//   // whenever the video element appears OR the camera is enabled.
//   useEffect(() => {
//     if (videoNode && mediaStreamRef.current) {
//       videoNode.srcObject = mediaStreamRef.current;

//       videoNode.onloadedmetadata = () => {
//         setIsVideoReady(true);
//       };

//       videoNode.play().catch((e) => console.error("Error playing video:", e));
//     }
//   }, [videoNode, isCameraEnabled]); // Dependency on isCameraEnabled is key

//   // Effect for handling audio processing
//   useEffect(() => {
//     if (!isSessionStarted || !mediaStreamRef.current) return;
//     const audioContext = audioContextRef.current;
//     if (!audioContext) return;

//     const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
//     const analyser = audioContext.createAnalyser();
//     analyser.fftSize = 256;
//     const dataArray = new Uint8Array(analyser.frequencyBinCount);
//     source.connect(analyser);
//     setIsAudioLive(true);

//     let cooldown = false;
//     const detectNoise = () => {
//       analyser.getByteFrequencyData(dataArray);
//       const average =
//         dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
//       if (Math.random() < 0.03)
//         console.log("Current average audio level:", average.toFixed(2));

//       const NOISE_THRESHOLD = 40;
//       if (average > NOISE_THRESHOLD && !cooldown) {
//         socket.emit("audio_event", {
//           message: "Potential background noise detected.",
//         });
//         cooldown = true;
//         setTimeout(() => {
//           cooldown = false;
//         }, 5000);
//       }
//       animationFrameRef.current = requestAnimationFrame(detectNoise);
//     };

//     detectNoise();

//     return () => {
//       if (animationFrameRef.current)
//         cancelAnimationFrame(animationFrameRef.current);
//     };
//   }, [isSessionStarted]);

//   // --- User Action Handlers ---
//   const handleEnableCamera = async () => {
//     try {
//       const stream = await navigator.mediaDevices.getUserMedia({
//         video: true,
//         audio: true,
//       });
//       mediaStreamRef.current = stream;
//       setIsCameraEnabled(true);
//     } catch (error) {
//       alert("Could not access camera/mic. Please check permissions.");
//       console.error("Error accessing media devices.", error);
//     }
//   };

//   const handleStartSession = () => {
//     if (!candidateName.trim() || !mediaStreamRef.current) return;
//     if (!audioContextRef.current) {
//       const context = new window.AudioContext();
//       audioContextRef.current = context;
//     }
//     audioContextRef.current.resume();

//     const start = () => {
//       socket.emit("start_session", { candidateName });
//       startRecording(mediaStreamRef.current!);
//       socket.off("connect", start);
//     };

//     if (socket.connected) {
//       start();
//     } else {
//       socket.on("connect", start);
//       socket.connect();
//     }
//   };

//   // --- Helper Functions ---
//   const sendFrame = () => {
//     if (
//       !socket.connected ||
//       !videoNode ||
//       !canvasRef.current ||
//       !isSessionStarted
//     )
//       return;
//     const canvas = canvasRef.current;
//     canvas.width = videoNode.videoWidth;
//     canvas.height = videoNode.videoHeight;
//     const context = canvas.getContext("2d");
//     if (context) {
//       context.drawImage(videoNode, 0, 0, canvas.width, canvas.height);
//       socket.emit("video_frame", {
//         image: canvas.toDataURL("image/jpeg", 0.7),
//       });
//     }
//   };
//   const startRecording = (stream: MediaStream) => {
//     if (mediaRecorderRef.current) return;
//     recordedChunksRef.current = [];
//     const options = { mimeType: "video/webm; codecs=vp9" };
//     mediaRecorderRef.current = new MediaRecorder(stream, options);
//     mediaRecorderRef.current.ondataavailable = (event) => {
//       if (event.data.size > 0) recordedChunksRef.current.push(event.data);
//     };
//     mediaRecorderRef.current.start(1000);
//     setIsRecording(true);
//   };
//   const stopSessionAndDownload = () => {
//     if (mediaRecorderRef.current && isRecording) {
//       mediaRecorderRef.current.onstop = () => {
//         const blob = new Blob(recordedChunksRef.current, {
//           type: "video/webm",
//         });
//         const url = URL.createObjectURL(blob);
//         const a = document.createElement("a");
//         a.href = url;
//         a.download = `proctoring_session_${sessionId || "rec"}.webm`;
//         a.click();
//         URL.revokeObjectURL(url);
//       };
//       mediaRecorderRef.current.stop();
//     }
//     if (mediaStreamRef.current) {
//       mediaStreamRef.current.getTracks().forEach((track) => track.stop());
//     }
//     if (audioContextRef.current && audioContextRef.current.state !== "closed") {
//       audioContextRef.current.close();
//     }
//     socket.disconnect();
//     setIsSessionStarted(false);
//     setIsCameraEnabled(false);
//     setIsVideoReady(false);
//     setAlerts([]);
//   };

//   // --- UI Rendering ---
//   if (!isSessionStarted) {
//     return (
//       <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center text-white font-sans p-4">
//         <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center w-full max-w-md">
//           <h1 className="text-3xl font-bold mb-4">Proctoring Session Setup</h1>
//           <p className="text-gray-400 mb-6">
//             Enable your camera, then enter your name to begin.
//           </p>
//           <div className="w-full h-64 bg-black rounded-md mb-4 flex items-center justify-center">
//             <video
//               ref={setVideoNode}
//               autoPlay
//               playsInline
//               muted
//               className={`w-full h-full object-cover ${
//                 !isCameraEnabled && "hidden"
//               }`}
//             ></video>
//             {!isCameraEnabled && <p className="text-gray-500">Camera is off</p>}
//           </div>
//           {!isCameraEnabled ? (
//             <button
//               onClick={handleEnableCamera}
//               className="bg-blue-600 hover:bg-blue-700 font-bold py-3 px-6 rounded-lg w-full"
//             >
//               Enable Camera
//             </button>
//           ) : (
//             <>
//               <input
//                 type="text"
//                 value={candidateName}
//                 onChange={(e) => setCandidateName(e.target.value)}
//                 placeholder="Enter your full name"
//                 className="bg-gray-700 w-full p-3 rounded-md mb-4 border border-gray-600"
//               />
//               <button
//                 onClick={handleStartSession}
//                 disabled={!candidateName.trim()}
//                 className="bg-green-600 hover:bg-green-700 font-bold py-3 px-6 rounded-lg w-full disabled:bg-gray-500"
//               >
//                 Start Session
//               </button>
//             </>
//           )}
//         </div>
//       </div>
//     );
//   }
//   return (
//     <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center text-white font-sans p-4">
//       <div className="w-full max-w-6xl">
//         <header className="flex items-center justify-between mb-4">
//           <div>
//             <h1 className="text-3xl font-bold">Proctoring Session</h1>
//             <p className="text-sm text-gray-400">Session ID: {sessionId}</p>
//           </div>
//           <div className="flex items-center space-x-4">
//             <div className="flex items-center space-x-2">
//               <div
//                 className={`w-3 h-3 rounded-full animate-pulse ${
//                   isConnected ? "bg-green-500" : "bg-red-500"
//                 }`}
//               ></div>
//               <p>{isConnected ? "Connected" : "Disconnected"}</p>
//             </div>
//             <button
//               onClick={stopSessionAndDownload}
//               className="bg-red-600 hover:bg-red-700 font-bold py-2 px-4 rounded-lg"
//             >
//               End Session & Download
//             </button>
//           </div>
//         </header>
//         <main className="grid grid-cols-3 gap-4">
//           <div className="col-span-2 bg-black rounded-lg shadow-lg border-2 border-gray-700 relative">
//             <video
//               ref={setVideoNode}
//               autoPlay
//               playsInline
//               muted
//               className="w-full h-full rounded-lg object-cover"
//             ></video>
//             <canvas ref={canvasRef} className="hidden"></canvas>
//             <div
//               className="absolute bottom-4 left-4"
//               title="Audio is being monitored"
//             >
//               <span
//                 className={`p-2 rounded-full ${
//                   isAudioLive ? "bg-gray-700/50" : "bg-red-700/50"
//                 }`}
//               >
//                 {isAudioLive ? "🔊" : "🔇"}
//               </span>
//             </div>
//             {isRecording && (
//               <div className="absolute top-4 right-4 flex items-center space-x-2 bg-red-600/80 p-2 rounded-lg">
//                 <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
//                 <span className="font-bold">REC</span>
//               </div>
//             )}
//           </div>
//           <div className="col-span-1 bg-gray-800 p-4 rounded-lg shadow-lg h-[60vh] overflow-y-auto">
//             <h2 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">
//               Event Log
//             </h2>
//             <div className="space-y-3">
//               {alerts.length === 0 ? (
//                 <p className="text-gray-400">Waiting for events...</p>
//               ) : (
//                 alerts.map((alert, index) => (
//                   <div
//                     key={index}
//                     className="bg-gray-700 p-3 rounded-md animate-fade-in"
//                   >
//                     <p className="font-bold text-red-400">
//                       {alert.type.replace(/_/g, " ").toUpperCase()}
//                     </p>
//                     <p className="text-sm">{alert.message}</p>
//                     <p className="text-xs text-gray-400 text-right">
//                       {alert.timestamp}
//                     </p>
//                   </div>
//                 ))
//               )}
//             </div>
//           </div>
//         </main>
//       </div>
//     </div>
//   );
// }

// export default App;

import { useState, useEffect, useRef } from "react";
import { socket } from "./services/socket";

interface Alert {
  message: string;
  type: string;
  timestamp: string;
}

function App() {
  // State variables
  const [isConnected, setIsConnected] = useState(socket.connected);
  const [alerts, setAlerts] = useState<Alert[]>([]);
  const [videoNode, setVideoNode] = useState<HTMLVideoElement | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [candidateName, setCandidateName] = useState<string>("");
  const [isSessionStarted, setIsSessionStarted] = useState(false);
  const [isRecording, setIsRecording] = useState(false);
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const recordedChunksRef = useRef<Blob[]>([]);
  const [isCameraEnabled, setIsCameraEnabled] = useState(false);
  const [isAudioLive, setIsAudioLive] = useState(false);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const [isVideoReady, setIsVideoReady] = useState(false);
  const animationFrameRef = useRef<number | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  const [isSessionEnded, setIsSessionEnded] = useState(false);

  // Effect for handling socket events
  useEffect(() => {
    function onConnect() {
      setIsConnected(true);
    }
    function onDisconnect() {
      setIsConnected(false);
      setIsSessionStarted(false);
    }
    function onProctoringAlert(alert: Omit<Alert, "timestamp">) {
      const newAlert: Alert = {
        ...alert,
        timestamp: new Date().toLocaleTimeString(),
      };
      setAlerts((prevAlerts) => [newAlert, ...prevAlerts]);
    }
    function onSessionStarted(data: { sessionId: string }) {
      setSessionId(data.sessionId);
      setIsSessionStarted(true);
    }
    socket.on("connect", onConnect);
    socket.on("disconnect", onDisconnect);
    socket.on("proctoring_alert", onProctoringAlert);
    socket.on("session_started", onSessionStarted);
    return () => {
      socket.off("connect");
      socket.off("disconnect");
      socket.off("proctoring_alert");
      socket.off("session_started");
    };
  }, []);

  // Effect for sending video frames
  useEffect(() => {
    if (isSessionStarted && isVideoReady) {
      const frameIntervalId = setInterval(sendFrame, 500);
      return () => clearInterval(frameIntervalId);
    }
  }, [isSessionStarted, isVideoReady]);

  // Effect for attaching media stream to the video element
  useEffect(() => {
    if (videoNode && mediaStreamRef.current) {
      videoNode.srcObject = mediaStreamRef.current;
      const handleMetadataLoaded = () => setIsVideoReady(true);
      videoNode.addEventListener("loadedmetadata", handleMetadataLoaded);
      videoNode.play().catch((e) => console.error("Error playing video:", e));
      return () =>
        videoNode.removeEventListener("loadedmetadata", handleMetadataLoaded);
    }
  }, [videoNode, isCameraEnabled]);

  // Effect for handling audio processing
  useEffect(() => {
    if (!isSessionStarted || !mediaStreamRef.current) return;
    const audioContext = audioContextRef.current;
    if (!audioContext) return;
    const source = audioContext.createMediaStreamSource(mediaStreamRef.current);
    const analyser = audioContext.createAnalyser();
    analyser.fftSize = 256;
    const dataArray = new Uint8Array(analyser.frequencyBinCount);
    source.connect(analyser);
    setIsAudioLive(true);
    let cooldown = false;
    const detectNoise = () => {
      analyser.getByteFrequencyData(dataArray);
      const average =
        dataArray.reduce((acc, val) => acc + val, 0) / dataArray.length;
      if (Math.random() < 0.03)
        console.log("Avg audio level:", average.toFixed(2));
      const NOISE_THRESHOLD = 40;
      if (average > NOISE_THRESHOLD && !cooldown) {
        socket.emit("audio_event", { message: "Noise detected." });
        cooldown = true;
        setTimeout(() => {
          cooldown = false;
        }, 5000);
      }
      animationFrameRef.current = requestAnimationFrame(detectNoise);
    };
    detectNoise();
    return () => {
      if (animationFrameRef.current)
        cancelAnimationFrame(animationFrameRef.current);
    };
  }, [isSessionStarted]);

  // Action Handlers
  const handleEnableCamera = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        video: true,
        audio: true,
      });
      mediaStreamRef.current = stream;
      setIsCameraEnabled(true);
    } catch (error) {
      alert("Could not access camera/mic.");
      console.error("Error accessing media devices.", error);
    }
  };
  const handleStartSession = () => {
    if (!candidateName.trim() || !mediaStreamRef.current) return;
    if (!audioContextRef.current) {
      const context = new window.AudioContext();
      audioContextRef.current = context;
    }
    audioContextRef.current.resume();
    const start = () => {
      socket.emit("start_session", { candidateName });
      startRecording(mediaStreamRef.current!);
      socket.off("connect", start);
    };
    if (socket.connected) {
      start();
    } else {
      socket.on("connect", start);
      socket.connect();
    }
  };

  const handleStopSession = () => {
    if (mediaRecorderRef.current && isRecording)
      mediaRecorderRef.current.stop();
    if (mediaStreamRef.current)
      mediaStreamRef.current.getTracks().forEach((track) => track.stop());
    if (audioContextRef.current && audioContextRef.current.state !== "closed")
      audioContextRef.current.close();
    socket.disconnect();
    setIsSessionEnded(true);
  };

  const handleDownloadVideo = () => {
    if (!recordedChunksRef.current || recordedChunksRef.current.length === 0) {
      alert("No video data recorded.");
      return;
    }
    const blob = new Blob(recordedChunksRef.current, { type: "video/webm" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `proctoring_session_${candidateName.replace(" ", "_")}_${
      sessionId || "rec"
    }.webm`;
    document.body.appendChild(a);
    a.click();
    window.URL.revokeObjectURL(url);
    a.remove();
  };

  const handleDownloadReport = async () => {
    if (!sessionId) {
      alert("Session ID not found. Cannot download report.");
      return;
    }
    try {
      const response = await fetch(
        `http://localhost:5000/api/generate_report/${sessionId}`
      );
      if (!response.ok) {
        throw new Error(`Report generation failed: ${response.statusText}`);
      }
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement("a");
      a.href = url;
      const disposition = response.headers.get("Content-Disposition");
      let filename = `Proctoring_Report_${sessionId}.pdf`;
      if (disposition && disposition.indexOf("attachment") !== -1) {
        const filenameRegex = /filename[^;=\n]*=((['"]).*?\2|[^;\n]*)/;
        const matches = filenameRegex.exec(disposition);
        if (matches != null && matches[1])
          filename = matches[1].replace(/['"]/g, "");
      }
      a.download = filename;
      document.body.appendChild(a);
      a.click();
      window.URL.revokeObjectURL(url);
      a.remove();
    } catch (error) {
      console.error("Error downloading report:", error);
      alert("Could not download the report.");
    }
  };

  const resetSession = () => {
    setIsSessionEnded(false);
    setIsCameraEnabled(false);
    setIsVideoReady(false);
    setAlerts([]);
    setCandidateName("");
    setSessionId(null);
  };

  const sendFrame = () => {
    if (
      !socket.connected ||
      !videoNode ||
      !canvasRef.current ||
      !isSessionStarted ||
      videoNode.videoWidth === 0
    )
      return;
    const c = canvasRef.current;
    c.width = videoNode.videoWidth;
    c.height = videoNode.videoHeight;
    const ctx = c.getContext("2d");
    if (ctx) {
      ctx.drawImage(videoNode, 0, 0, c.width, c.height);
      socket.emit("video_frame", { image: c.toDataURL("image/jpeg", 0.7) });
    }
  };
  const startRecording = (stream: MediaStream) => {
    if (mediaRecorderRef.current) return;
    recordedChunksRef.current = [];
    const opts = { mimeType: "video/webm; codecs=vp9" };
    mediaRecorderRef.current = new MediaRecorder(stream, opts);
    mediaRecorderRef.current.ondataavailable = (e) => {
      if (e.data.size > 0) recordedChunksRef.current.push(e.data);
    };
    mediaRecorderRef.current.start(1000);
    setIsRecording(true);
  };

  // UI Rendering
  if (isSessionEnded) {
    return (
      <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center text-white font-sans p-4">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center w-full max-w-md">
          <h1 className="text-3xl font-bold mb-4">Session Complete</h1>
          <p className="text-gray-400 mb-6">Session ID: {sessionId}</p>
          <div className="space-y-4">
            <button
              onClick={handleDownloadReport}
              className="bg-blue-600 hover:bg-blue-700 font-bold py-3 px-6 rounded-lg w-full"
            >
              Download Proctoring Report (PDF)
            </button>
            <button
              onClick={handleDownloadVideo}
              className="bg-green-600 hover:bg-green-700 font-bold py-3 px-6 rounded-lg w-full"
            >
              Download Video Recording
            </button>
            <button
              onClick={resetSession}
              className="text-gray-400 hover:text-white pt-4"
            >
              Start New Session
            </button>
          </div>
        </div>
      </div>
    );
  }
  if (!isCameraEnabled) {
    return (
      <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center text-white font-sans p-4">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center w-full max-w-md">
          <h1 className="text-3xl font-bold mb-4">Proctoring Session Setup</h1>
          <p className="text-gray-400 mb-6">Enable your camera to begin.</p>
          <div className="w-full h-64 bg-black rounded-md mb-4 flex items-center justify-center">
            <p className="text-gray-500">Camera is off</p>
          </div>
          <button
            onClick={handleEnableCamera}
            className="bg-blue-600 hover:bg-blue-700 font-bold py-3 px-6 rounded-lg w-full"
          >
            Enable Camera
          </button>
        </div>
      </div>
    );
  }
  if (!isSessionStarted) {
    return (
      <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center text-white font-sans p-4">
        <div className="bg-gray-800 p-8 rounded-lg shadow-lg text-center w-full max-w-md">
          <h1 className="text-3xl font-bold mb-4">Camera Preview</h1>
          <p className="text-gray-400 mb-6">
            Enter your name to begin the session.
          </p>
          <video
            ref={setVideoNode}
            autoPlay
            playsInline
            muted
            className="w-full h-64 bg-black rounded-md mb-4 object-cover"
          ></video>
          <input
            type="text"
            value={candidateName}
            onChange={(e) => setCandidateName(e.target.value)}
            placeholder="Enter your full name"
            className="bg-gray-700 w-full p-3 rounded-md mb-4 border border-gray-600"
          />
          <button
            onClick={handleStartSession}
            disabled={!candidateName.trim()}
            className="bg-green-600 hover:bg-green-700 font-bold py-3 px-6 rounded-lg w-full disabled:bg-gray-500"
          >
            Start Session
          </button>
        </div>
      </div>
    );
  }
  return (
    <div className="bg-gray-900 min-h-screen flex flex-col items-center justify-center text-white font-sans p-4">
      <div className="w-full max-w-6xl">
        <header className="flex items-center justify-between mb-4">
          <div>
            <h1 className="text-3xl font-bold">Proctoring Session</h1>
            <p className="text-sm text-gray-400">Session ID: {sessionId}</p>
          </div>
          <div className="flex items-center space-x-4">
            <div className="flex items-center space-x-2">
              <div
                className={`w-3 h-3 rounded-full animate-pulse ${
                  isConnected ? "bg-green-500" : "bg-red-500"
                }`}
              ></div>
              <p>{isConnected ? "Connected" : "Disconnected"}</p>
            </div>
            <button
              onClick={handleStopSession}
              className="bg-red-600 hover:bg-red-700 font-bold py-2 px-4 rounded-lg"
            >
              End Session
            </button>
          </div>
        </header>
        <main className="grid grid-cols-3 gap-4">
          <div className="col-span-2 bg-black rounded-lg shadow-lg border-2 border-gray-700 relative">
            <video
              ref={setVideoNode}
              autoPlay
              playsInline
              muted
              className="w-full h-full rounded-lg object-cover"
            ></video>
            <canvas ref={canvasRef} className="hidden"></canvas>
            <div className="absolute bottom-4 left-4" title="Audio monitoring">
              <span
                className={`p-2 rounded-full ${
                  isAudioLive ? "bg-gray-700/50" : "bg-red-700/50"
                }`}
              >
                {isAudioLive ? "🔊" : "🔇"}
              </span>
            </div>
            {isRecording && (
              <div className="absolute top-4 right-4 flex items-center space-x-2 bg-red-600/80 p-2 rounded-lg">
                <div className="w-3 h-3 bg-white rounded-full animate-pulse"></div>
                <span className="font-bold">REC</span>
              </div>
            )}
          </div>
          <div className="col-span-1 bg-gray-800 p-4 rounded-lg shadow-lg h-[60vh] overflow-y-auto">
            <h2 className="text-xl font-semibold mb-4 border-b border-gray-600 pb-2">
              Event Log
            </h2>
            <div className="space-y-3">
              {alerts.length === 0 ? (
                <p className="text-gray-400">Waiting for events...</p>
              ) : (
                alerts.map((a, i) => (
                  <div
                    key={i}
                    className="bg-gray-700 p-3 rounded-md animate-fade-in"
                  >
                    <p className="font-bold text-red-400">
                      {a.type.replace(/_/g, " ").toUpperCase()}
                    </p>
                    <p className="text-sm">{a.message}</p>
                    <p className="text-xs text-gray-400 text-right">
                      {a.timestamp}
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
