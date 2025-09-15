import os
from flask import Flask
from flask_cors import CORS
from flask_socketio import SocketIO
from dotenv import load_dotenv

# Load environment variables from .env file
load_dotenv()

# --- App Initialization ---
app = Flask(__name__)
CORS(app, resources={r"/*": {"origins": "http://localhost:5173"}}) # Allow our React app to connect
socketio = SocketIO(app, cors_allowed_origins="http://localhost:5173", async_mode='eventlet')

# --- Database Connection (Placeholder for now) ---
# We will set up the actual connection in a later phase.
# For now, we just confirm the URI is loaded.
mongo_uri = os.getenv('MONGO_URI')
if not mongo_uri:
    print("Error: MONGO_URI not found in environment variables.")
else:
    print("Successfully loaded MONGO_URI.")


# --- WebSocket Event Handlers ---
@socketio.on('connect')
def handle_connect():
    """
    Event handler for a new client connection.
    """
    print('✅ Client connected')

@socketio.on('disconnect')
def handle_disconnect():
    """
    Event handler for a client disconnection.
    """
    print('❌ Client disconnected')


# --- Main Execution ---
if __name__ == '__main__':
    print("🚀 Starting Flask server...")
    # We use eventlet for WebSocket compatibility
    import eventlet
    eventlet.wsgi.server(eventlet.listen(('0.0.0.0', 5000)), app)