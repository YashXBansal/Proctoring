import os
import time
import base64
import numpy as np
import cv2
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from dotenv import load_dotenv
from ultralytics import YOLO
import mediapipe as mp

# --- Initialization & Config ---
load_dotenv()
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": ["http://localhost:5173"]}})
socketio = SocketIO(app, cors_allowed_origins=["http://localhost:5173"], async_mode='eventlet')

class ProctoringConfig:
    NO_FACE_THRESHOLD = 10
    MULTIPLE_FACES_THRESHOLD = 5
    LOOKING_AWAY_THRESHOLD = 4
    GAZE_OFF_SCREEN_THRESHOLD = 3
    DROWSINESS_THRESHOLD = 3
    ALERT_COOLDOWN = 5
    YOLO_MODEL_PATH = 'yolov8m.pt'
    YOLO_CONFIDENCE_THRESHOLD = 0.45
    UNAUTHORIZED_OBJECTS = {'cell phone', 'book', 'laptop', 'mouse', 'remote', 'keyboard', 'tv'}
    EAR_THRESHOLD = 0.21
    LOOKING_AWAY_YAW_THRESHOLD = 25
    GAZE_THRESHOLD = 0.7

# --- AI Model Initialization ---
print("🔬 Initializing AI models and CV tools...")
yolo_model = YOLO(ProctoringConfig.YOLO_MODEL_PATH)
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=2, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5)
print("✅ Models and tools initialized successfully.")

# --- Helper Functions ---
def base64_to_image(base64_string: str) -> np.ndarray | None:
    try:
        if ',' not in base64_string: return None
        base64_data = base64_string.split(',')[1]
        image_bytes = base64.b64decode(base64_data)
        image_array = np.frombuffer(image_bytes, dtype=np.uint8)
        return cv2.imdecode(image_array, cv2.IMREAD_COLOR)
    except Exception: return None

def calculate_ear(eye_landmarks):
    p1 = np.linalg.norm(np.array([eye_landmarks[1].x, eye_landmarks[1].y]) - np.array([eye_landmarks[15].x, eye_landmarks[15].y]))
    p2 = np.linalg.norm(np.array([eye_landmarks[2].x, eye_landmarks[2].y]) - np.array([eye_landmarks[14].x, eye_landmarks[14].y]))
    p3 = np.linalg.norm(np.array([eye_landmarks[3].x, eye_landmarks[3].y]) - np.array([eye_landmarks[13].x, eye_landmarks[13].y]))
    p4 = np.linalg.norm(np.array([eye_landmarks[4].x, eye_landmarks[4].y]) - np.array([eye_landmarks[12].x, eye_landmarks[12].y]))
    p5 = np.linalg.norm(np.array([eye_landmarks[5].x, eye_landmarks[5].y]) - np.array([eye_landmarks[11].x, eye_landmarks[11].y]))
    p6 = np.linalg.norm(np.array([eye_landmarks[6].x, eye_landmarks[6].y]) - np.array([eye_landmarks[10].x, eye_landmarks[10].y]))
    vertical_dist = (p1 + p2 + p3 + p4 + p5 + p6) / 6.0
    horizontal_dist = np.linalg.norm(np.array([eye_landmarks[0].x, eye_landmarks[0].y]) - np.array([eye_landmarks[8].x, eye_landmarks[8].y]))
    if horizontal_dist == 0: return 0.3
    return vertical_dist / horizontal_dist

# --- The Core Proctoring Logic ---
class ProctoringSession:
    def __init__(self, config):
        self.config = config
        self.frame_count = 0
        self.last_alert_times = {}
        self.violation_start_times = {}
        self.LEFT_EYE_INDICES = [362, 382, 381, 380, 373, 374, 390, 249, 263, 466, 388, 387, 386, 385, 384, 398]
        self.RIGHT_EYE_INDICES = [33, 7, 163, 144, 145, 153, 154, 155, 133, 173, 157, 158, 159, 160, 161, 246]
        self.LEFT_PUPIL_INDEX = 473
        self.RIGHT_PUPIL_INDEX = 468
    
    def send_alert(self, event_type, message):
        current_time = time.time()
        if current_time - self.last_alert_times.get(event_type, 0) > self.config.ALERT_COOLDOWN:
            print(f"🚨 ALERT: {message}")
            socketio.emit('proctoring_alert', {'message': message, 'type': event_type})
            self.last_alert_times[event_type] = current_time

    def process_frame(self, frame: np.ndarray):
        if self.frame_count % 5 == 0: self.analyze_objects(frame)
        self.frame_count += 1
        
        frame_rgb = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
        face_results = face_mesh.process(frame_rgb)
        
        num_faces = len(face_results.multi_face_landmarks) if face_results.multi_face_landmarks else 0
        self.analyze_face_presence(num_faces)

        if num_faces == 1:
            landmarks = face_results.multi_face_landmarks[0]
            self.analyze_focus(frame, landmarks)
            self.analyze_drowsiness(landmarks)
            self.analyze_gaze(landmarks)

    def analyze_objects(self, frame: np.ndarray):
        results = yolo_model(frame, verbose=False, conf=self.config.YOLO_CONFIDENCE_THRESHOLD)
        suspicious_items = {results[0].names[int(cls)] for cls in results[0].boxes.cls}.intersection(self.config.UNAUTHORIZED_OBJECTS)
        if suspicious_items:
            self.send_alert("object_detection", f"Unauthorized object(s) detected: {', '.join(suspicious_items)}")

    def analyze_face_presence(self, num_faces):
        for event_type, is_violating, message, threshold in [
            ("no_face", num_faces == 0, "Candidate not visible.", self.config.NO_FACE_THRESHOLD),
            ("multiple_faces", num_faces > 1, "Multiple faces detected.", self.config.MULTIPLE_FACES_THRESHOLD)
        ]:
            if is_violating:
                if event_type not in self.violation_start_times: self.violation_start_times[event_type] = time.time()
                if time.time() - self.violation_start_times[event_type] > threshold: self.send_alert(event_type, message)
            elif event_type in self.violation_start_times: del self.violation_start_times[event_type]
    
    def analyze_drowsiness(self, landmarks):
        avg_ear = (calculate_ear([landmarks.landmark[i] for i in self.LEFT_EYE_INDICES]) + calculate_ear([landmarks.landmark[i] for i in self.RIGHT_EYE_INDICES])) / 2.0
        is_violating = avg_ear < self.config.EAR_THRESHOLD
        if is_violating:
            if "drowsiness" not in self.violation_start_times: self.violation_start_times["drowsiness"] = time.time()
            if time.time() - self.violation_start_times["drowsiness"] > self.config.DROWSINESS_THRESHOLD: self.send_alert("drowsiness", "Drowsiness detected (eyes closed).")
        elif "drowsiness" in self.violation_start_times: del self.violation_start_times["drowsiness"]

    def analyze_gaze(self, landmarks):
        left_pupil, left_eye_right, left_eye_left = landmarks.landmark[self.LEFT_PUPIL_INDEX], landmarks.landmark[362], landmarks.landmark[263]
        if (left_eye_right.x - left_eye_left.x) == 0: return
        gaze_ratio = (left_pupil.x - left_eye_left.x) / (left_eye_right.x - left_eye_left.x)
        is_violating = gaze_ratio < (1 - self.config.GAZE_THRESHOLD) or gaze_ratio > self.config.GAZE_THRESHOLD
        if is_violating:
            if "gaze_off_screen" not in self.violation_start_times: self.violation_start_times["gaze_off_screen"] = time.time()
            if time.time() - self.violation_start_times["gaze_off_screen"] > self.config.GAZE_OFF_SCREEN_THRESHOLD: self.send_alert("gaze_off_screen", "Candidate gaze is off-screen.")
        elif "gaze_off_screen" in self.violation_start_times: del self.violation_start_times["gaze_off_screen"]

    def analyze_focus(self, frame: np.ndarray, landmarks):
        img_h, img_w, _ = frame.shape
        face_2d = np.array([(landmarks.landmark[i].x * img_w, landmarks.landmark[i].y * img_h) for i in [1, 199, 234, 454, 57, 287]], dtype=np.float64)
        model_points = np.array([(0.0, 0.0, 0.0), (0.0, -330.0, -65.0), (-225.0, 170.0, -135.0), (225.0, 170.0, -135.0), (-150.0, -150.0, -125.0), (150.0, -150.0, -125.0)])
        cam_matrix = np.array([[img_w, 0, img_h / 2], [0, img_w, img_w / 2], [0, 0, 1]], dtype=np.float64)
        success, rot_vec, _ = cv2.solvePnP(model_points, face_2d, cam_matrix, np.zeros((4, 1)))
        if not success: return
        rmat, _ = cv2.Rodrigues(rot_vec)
        angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat)
        yaw = angles[1]
        is_violating = abs(yaw) > self.config.LOOKING_AWAY_YAW_THRESHOLD
        if is_violating:
            if "focus_lost" not in self.violation_start_times: self.violation_start_times["focus_lost"] = time.time()
            if time.time() - self.violation_start_times["focus_lost"] > self.config.LOOKING_AWAY_THRESHOLD: self.send_alert("focus_lost", f"Candidate is looking away (Head Yaw: {int(yaw)}°).")
        elif "focus_lost" in self.violation_start_times: del self.violation_start_times["focus_lost"]

# --- WebSocket Handlers ---
current_session = None
@socketio.on('connect')
def handle_connect(): global current_session; current_session = ProctoringSession(ProctoringConfig); print('✅ Client connected')
@socketio.on('disconnect')
def handle_disconnect(): global current_session; current_session = None; print('❌ Client disconnected')

@socketio.on('video_frame')
def handle_video_frame(data):
    if current_session:
        frame = base64_to_image(data.get('image', ''))
        if frame is not None: current_session.process_frame(frame)

@socketio.on('audio_event')
def handle_audio_event(data):
    if current_session:
        current_session.send_alert("audio_detection", data.get('message', 'Significant audio detected.'))

# --- Main Execution ---
if __name__ == '__main__':
    print("🚀 Starting Flask server...")
    import eventlet
    eventlet.wsgi.server(eventlet.listen(('0.0.0.0', 5000)), app)