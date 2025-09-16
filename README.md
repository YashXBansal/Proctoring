# Focus & Object Detection in Video Interviews

This project is a video proctoring system designed to ensure the integrity of online interviews. It uses computer vision to monitor a candidate's focus and detect any unauthorized items in their video feed, providing real-time alerts and a final integrity report.

**Live Demo:** [https://proctoring-beryl.vercel.app/](https://proctoring-beryl.vercel.app/)

## Features

* **Real-time Video Proctoring:** Monitors the candidate's video stream during an online interview session.
* **Focus Detection:**
    * Detects if the candidate is looking away from the screen for an extended period.
    * Flags if the candidate's face is not visible.
    * Identifies if multiple faces are present in the frame.
    * Detects potential drowsiness by monitoring eye-aspect ratio.
* **Object Detection:**
    * Identifies unauthorized items such as mobile phones, books, and other electronic devices using a YOLOv8 model.
* **Event Logging:** All suspicious events are timestamped and logged to a MongoDB database.
* **Proctoring Report:**
    * Generates a downloadable PDF report at the end of the session.
    * The report includes an "Integrity Score" calculated based on the number and type of flagged events.
* **Video Recording:** The entire session is recorded and can be downloaded as a `.webm` file.
* **Audio Monitoring:** (Bonus) Detects and flags significant background noise.

## Tech Stack

* **Frontend:** React, TypeScript, Vite, Tailwind CSS, Socket.IO Client
* **Backend:** Python, Flask, Socket.IO, OpenCV, MediaPipe, PyTorch, Ultralytics (YOLOv8)
* **Database:** MongoDB Atlas
* **Deployment:**
    * Frontend deployed on **Vercel**.
    * Backend deployed on **Render**.

## Installation & Local Setup

### Prerequisites

* Node.js and npm
* Python 3.11
* A MongoDB Atlas account and a connection URI

### 1. Clone the Repository

```bash
git clone [https://github.com/YashXBansal/Proctoring.git](https://github.com/YashXBansal/Proctoring.git)
cd Proctoring
2. Backend Setup
Navigate to the backend directory:
```
```Bash

cd backend
Create and activate a Python virtual environment:
```
```Bash

# On macOS/Linux
python3 -m venv venv
source venv/bin/activate

# On Windows
python -m venv venv
venv\Scripts\activate
Install the required Python packages:
```
```Bash

pip install -r requirements.txt
Create a .env file in the backend directory and add your MongoDB connection string:

MONGO_URI="mongodb+srv://<user>:<password>@cluster.mongodb.net/proctoringDB"
```
```
3. Frontend Setup
Navigate to the frontend directory from the root folder:
```
```
Bash

cd frontend
Install the required npm packages:
```
```
Bash

npm install
```

```
4. Running the Application Locally
Start the Backend Server:
In the backend directory, run:
```

```Bash

python app.py
The backend server will start on http://localhost:5000.

Start the Frontend Development Server:
In the frontend directory, run:
```

```Bash

npm run dev
The frontend application will be available at http://localhost:5173.
```


##  Deployment

The application is deployed with the frontend on Vercel and the backend on Render.
```
Backend (Render)
Push the repository to GitHub.

Create a new "Web Service" on Render and connect it to the GitHub repository.

Configure the service with the following settings:

Root Directory: backend

Build Command: pip install -r requirements.txt

Start Command: gunicorn app:app

Add the following Environment Variables in the Render dashboard:

MONGO_URI: Your MongoDB connection string.

PYTHON_VERSION: 3.11.7
```
```
Frontend (Vercel)
Update the backend URL in frontend/src/services/socket.ts to your live Render service URL.

Connect the GitHub repository to a new Vercel project.

Configure the project with the following settings:

Framework Preset: Vite

Root Directory: frontend

Deploy.
```