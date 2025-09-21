import os
import time
import base64
import numpy as np
import cv2
from flask import Flask, jsonify, send_file
from flask_cors import CORS
from flask_socketio import SocketIO
from dotenv import load_dotenv
from ultralytics import YOLO
import mediapipe as mp
from pymongo import MongoClient
import uuid
from datetime import datetime
import pandas as pd
from fpdf import FPDF, XPos, YPos
import io
import textwrap

# --- Initialization & Config ---
load_dotenv()
app = Flask(__name__)

# --- Deployment Change: Update CORS to allow your frontend URL ---
# backend/app.py

# --- Deployment Change: Update CORS to allow your frontend URL ---
allowed_origins = [
    "https://proctoring-beryl.vercel.app",  # Your deployed frontend
    "http://localhost:5173"               # Your local frontend for testing
]
CORS(app, resources={r"/*": {"origins": allowed_origins}})
socketio = SocketIO(app, cors_allowed_origins=allowed_origins, async_mode='eventlet')

try:
    mongo_uri = os.getenv('MONGO_URI')
    client = MongoClient(mongo_uri)
    db = client['proctoringDB']
    events_collection = db['events']
    print("✅ Successfully connected to MongoDB.")
except Exception as e:
    print(f"❌ Error connecting to MongoDB: {e}")
    client = None

class ProctoringConfig:
    NO_FACE_THRESHOLD = 10; MULTIPLE_FACES_THRESHOLD = 5; LOOKING_AWAY_THRESHOLD = 4
    GAZE_OFF_SCREEN_THRESHOLD = 3; DROWSINESS_THRESHOLD = 3; ALERT_COOLDOWN = 5
    YOLO_MODEL_PATH = 'yolov8n.pt'; YOLO_CONFIDENCE_THRESHOLD = 0.45
    UNAUTHORIZED_OBJECTS = {'cell phone', 'book', 'laptop', 'mouse', 'remote', 'keyboard', 'tv'}
    EAR_THRESHOLD = 0.21; LOOKING_AWAY_YAW_THRESHOLD = 25; GAZE_THRESHOLD = 0.7
print("🔬 Initializing AI models and CV tools...")
yolo_model = YOLO(ProctoringConfig.YOLO_MODEL_PATH)
mp_face_mesh = mp.solutions.face_mesh
face_mesh = mp_face_mesh.FaceMesh(max_num_faces=2, refine_landmarks=True, min_detection_confidence=0.5, min_tracking_confidence=0.5)
print("✅ Models and tools initialized successfully.")

def base64_to_image(s: str):
    try:
        if ',' not in s: return None
        d = s.split(',')[1]; b = base64.b6decode(d); n = np.frombuffer(b, dtype=np.uint8)
        return cv2.imdecode(n, cv2.IMREAD_COLOR)
    except Exception: return None
def calculate_ear(eye):
    p1=np.linalg.norm(np.array([eye[1].x,eye[1].y])-np.array([eye[15].x,eye[15].y]));p2=np.linalg.norm(np.array([eye[2].x,eye[2].y])-np.array([eye[14].x,eye[14].y]))
    p3=np.linalg.norm(np.array([eye[3].x,eye[3].y])-np.array([eye[13].x,eye[13].y]));p4=np.linalg.norm(np.array([eye[4].x,eye[4].y])-np.array([eye[12].x,eye[12].y]))
    p5=np.linalg.norm(np.array([eye[5].x,eye[5].y])-np.array([eye[11].x,eye[11].y]));p6=np.linalg.norm(np.array([eye[6].x,eye[6].y])-np.array([eye[10].x,eye[10].y]))
    v=(p1+p2+p3+p4+p5+p6)/6.0;h=np.linalg.norm(np.array([eye[0].x,eye[0].y])-np.array([eye[8].x,eye[8].y]))
    return 0.3 if h==0 else v/h

class ProctoringSession:
    def __init__(self, config, candidate_name="Unknown"):
        self.config=config;self.session_id=str(uuid.uuid4());self.candidate_name=candidate_name
        print(f"🎉 New session for {self.candidate_name}: {self.session_id}")
        self.frame_count=0;self.last_alert_times={};self.violation_start_times={}
        self.LEFT_EYE=[362,382,381,380,373,374,390,249,263,466,388,387,386,385,384,398]
        self.RIGHT_EYE=[33,7,163,144,145,153,154,155,133,173,157,158,159,160,161,246]
        self.PUPIL_LEFT=473;self.PUPIL_RIGHT=468
    def send_alert(self,e_type,msg,meta=None):
        c_time=time.time()
        if c_time-self.last_alert_times.get(e_type,0)>self.config.ALERT_COOLDOWN:
            print(f"🚨 ALERT: {msg}");socketio.emit('proctoring_alert',{'message':msg,'type':e_type});self.last_alert_times[e_type]=c_time
            if client:
                doc={"sessionId":self.session_id,"candidateName":self.candidate_name,"timestamp":datetime.utcnow(),"eventType":e_type,"message":msg,"metadata":meta or {}}
                try: events_collection.insert_one(doc); print(f"📝 Event '{e_type}' logged.")
                except Exception as e: print(f"❌ DB log error: {e}")

    def process_frame(self, frame):
        try:
            if self.frame_count % 5 == 0: self.analyze_objects(frame)
            self.frame_count += 1
            
            frame.flags.writeable = False
            rgb_frame = cv2.cvtColor(frame, cv2.COLOR_BGR2RGB)
            face_results = face_mesh.process(rgb_frame)
            frame.flags.writeable = True

            num_faces = len(face_results.multi_face_landmarks) if face_results.multi_face_landmarks else 0
            self.analyze_face_presence(num_faces)
            
            if num_faces == 1:
                landmarks = face_results.multi_face_landmarks[0]
                self.analyze_focus(frame, landmarks)
                self.analyze_drowsiness(landmarks)
                self.analyze_gaze(landmarks)
        except Exception as e:
            print(f"Error in process_frame: {e}") # Uncomment for deep debugging
            pass

    def analyze_objects(self,frame):
        try:
            res=yolo_model(frame,verbose=False,conf=self.config.YOLO_CONFIDENCE_THRESHOLD)
            items={res[0].names[int(c)] for c in res[0].boxes.cls}.intersection(self.config.UNAUTHORIZED_OBJECTS)
            if items:l=list(items);self.send_alert("object_detection",f"Unauthorized object(s): {', '.join(l)}",meta={"items":l})
        except Exception: pass
    def analyze_face_presence(self,num):
        try:
            for e,v,m,t in [("no_face",num==0,"Not visible.",self.config.NO_FACE_THRESHOLD),("multiple_faces",num>1,"Multiple faces.",self.config.MULTIPLE_FACES_THRESHOLD)]:
                if v:
                    if e not in self.violation_start_times:self.violation_start_times[e]=time.time()
                    if time.time()-self.violation_start_times[e]>t:self.send_alert(e,m)
                elif e in self.violation_start_times:del self.violation_start_times[e]
        except Exception: pass
    def analyze_drowsiness(self,lm):
        try:
            ear=(calculate_ear([lm.landmark[i] for i in self.LEFT_EYE])+calculate_ear([lm.landmark[i] for i in self.RIGHT_EYE]))/2.0
            v=ear<self.config.EAR_THRESHOLD
            if v:
                if"drowsiness"not in self.violation_start_times:self.violation_start_times["drowsiness"]=time.time()
                if time.time()-self.violation_start_times["drowsiness"]>self.config.DROWSINESS_THRESHOLD:self.send_alert("drowsiness","Drowsiness detected.",meta={"ear":round(ear,3)})
            elif"drowsiness"in self.violation_start_times:del self.violation_start_times["drowsiness"]
        except Exception: pass
    def analyze_gaze(self,lm):
        try:
            if any(i >= len(lm.landmark) for i in [self.PUPIL_LEFT, 362, 263]): return
            lp,lr,ll=lm.landmark[self.PUPIL_LEFT],lm.landmark[362],lm.landmark[263]
            if(lr.x-ll.x)==0:return
            r=(lp.x-ll.x)/(lr.x-ll.x);v=r<(1-self.config.GAZE_THRESHOLD)or r>self.config.GAZE_THRESHOLD
            if v:
                if"gaze_off_screen"not in self.violation_start_times:self.violation_start_times["gaze_off_screen"]=time.time()
                if time.time()-self.violation_start_times["gaze_off_screen"]>self.config.GAZE_OFF_SCREEN_THRESHOLD:self.send_alert("gaze_off_screen","Gaze is off-screen.",meta={"ratio":round(r,3)})
            elif"gaze_off_screen"in self.violation_start_times:del self.violation_start_times["gaze_off_screen"]
        except Exception: pass
    def analyze_focus(self, frame, lm):
        try:
            h, w, _ = frame.shape
            if any(i >= len(lm.landmark) for i in [1, 199, 234, 454, 57, 287]): return
            f2d = np.array([(lm.landmark[i].x * w, lm.landmark[i].y * h) for i in [1, 199, 234, 454, 57, 287]], dtype=np.float64)
            model_points = np.array([(0,0,0),(0,-330,-65),(-225,170,-135),(225,170,-135),(-150,-150,-125),(150,-150,-125)])
            cam_matrix = np.array([[w, 0, h / 2], [0, w, w / 2], [0, 0, 1]], dtype=np.float64)
            success, rot_vec, _ = cv2.solvePnP(model_points, f2d, cam_matrix, np.zeros((4, 1)))
            if not success: return
            rmat, _ = cv2.Rodrigues(rot_vec); angles, _, _, _, _, _ = cv2.RQDecomp3x3(rmat); yaw = angles[1]
            is_violating = abs(yaw) > self.config.LOOKING_AWAY_YAW_THRESHOLD
            if is_violating:
                if "focus_lost" not in self.violation_start_times: self.violation_start_times["focus_lost"] = time.time()
                if time.time() - self.violation_start_times["focus_lost"] > self.config.LOOKING_AWAY_THRESHOLD: self.send_alert("focus_lost", f"Looking away (Yaw: {int(yaw)}°).", meta={"yaw": int(yaw)})
            elif "focus_lost" in self.violation_start_times: del self.violation_start_times["focus_lost"]
        except (cv2.error, IndexError): pass

# WebSocket handlers
current_session = None
@socketio.on('connect')
def handle_connect():print("✅ Client connected")
@socketio.on('start_session')
def h_start(data):
    global current_session; name=data.get('candidateName','Unknown'); current_session=ProctoringSession(ProctoringConfig,name)
    socketio.emit('session_started',{'sessionId':current_session.session_id})
@socketio.on('disconnect')
def h_disc():
    global current_session
    if current_session: print(f"❌ Client disconnected from session: {current_session.session_id}"); current_session = None
@socketio.on('video_frame')
def h_frame(data):
    if current_session:
        frame=base64_to_image(data.get('image',''))
        if frame is not None: current_session.process_frame(frame)
@socketio.on('audio_event')
def h_audio(data):
    if current_session: current_session.send_alert("audio_detection", data.get('message','Audio detected.'))

DEDUCTIONS = { "no_face": 15, "multiple_faces": 20, "object_detection": 10, "focus_lost": 5, "drowsiness": 5, "gaze_off_screen": 5, "audio_detection": 2 }
class PDF(FPDF):
    def header(self): self.set_font('Helvetica','B',16); self.cell(0,10,'Proctoring Report',align='C',new_x=XPos.LMARGIN,new_y=YPos.NEXT); self.ln(5)
    def footer(self): self.set_y(-15); self.set_font('Helvetica','I',8); self.cell(0,10,f'Page {self.page_no()}',align='C')
    def chapter_title(self,title): self.set_font('Helvetica','B',12); self.cell(0,10,title,new_x=XPos.LMARGIN,new_y=YPos.NEXT); self.ln(4)
    def chapter_body(self,body): self.set_font('Helvetica','',12); self.multi_cell(0,10,body.encode('latin-1','replace').decode('latin-1'))
def create_report_pdf(session_id):
    if not client: return None
    events = list(events_collection.find({"sessionId": session_id}))
    if not events: return None
    df=pd.DataFrame(events);df['timestamp']=pd.to_datetime(df['timestamp']);name=df['candidateName'].iloc[0];dur=df['timestamp'].max()-df['timestamp'].min()
    counts=df['eventType'].value_counts().to_dict();score=100;deductions=[]
    for e,c in counts.items():d=DEDUCTIONS.get(e,0)*c;score-=d;deductions.append(f"- {e.replace('_',' ').title()}: {c} time(s) (-{d} points)")
    score=max(0,score)
    pdf=PDF(); pdf.add_page(); pdf.chapter_title('Interview Summary')
    summary=f"Candidate Name: {name}\nSession ID: {session_id}\nInterview Duration: {str(dur).split('.')[0]}\nFinal Integrity Score: {score} / 100"
    pdf.chapter_body(summary); pdf.chapter_title('Suspicious Events Summary')
    pdf.chapter_body("\n".join(deductions) if deductions else "No suspicious events were detected.")
    pdf.chapter_title('Detailed Event Log'); pdf.set_font('Courier','',9)
    wrap_width = 100
    for _,row in df.iterrows():
        ts=row['timestamp'].strftime('%Y-%m-%d %H:%M:%S');msg=f"[{ts}] [{row['eventType'].upper()}] {row['message']}"
        msg_cleaned=msg.encode('latin-1','replace').decode('latin-1')
        wrapped_lines=textwrap.wrap(msg_cleaned,width=wrap_width,break_long_words=True,replace_whitespace=False)
        for line in wrapped_lines: pdf.multi_cell(0,5,line,split_only=False)
        pdf.ln(1)
    return pdf.output()

# API Endpoints
@app.route('/api/report/<session_id>', methods=['GET'])
def get_report_data(session_id):
    if not client: return jsonify({"error": "DB not available"}), 500
    events=list(events_collection.find({"sessionId":session_id},{'_id':0}))
    return jsonify(events) if events else (jsonify({"error": "Not found"}), 404)
@app.route('/api/generate_report/<session_id>', methods=['GET'])
def generate_and_download_report(session_id):
    pdf_data = create_report_pdf(session_id)
    if pdf_data:
        buffer = io.BytesIO(pdf_data); buffer.seek(0)
        events = list(events_collection.find({"sessionId": session_id}))
        name = events[0]['candidateName'].replace(' ', '_') if events else 'report'
        filename = f"Proctoring_Report_{name}_{session_id[:8]}.pdf"
        return send_file(buffer, as_attachment=True, download_name=filename, mimetype='application/pdf')
    return jsonify({"error": "Could not generate report"}), 404

if __name__ == '__main__':
    print("🚀 Starting Flask server...")
    socketio.run(app, host='0.0.0.0', port=5000)