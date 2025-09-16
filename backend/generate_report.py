import requests
import pandas as pd
from fpdf import FPDF, XPos, YPos
import sys
import textwrap

# --- Configuration (Unchanged) ---
API_BASE_URL = "http://localhost:5000/api/report/"
DEDUCTIONS = {
    "no_face": 15, "multiple_faces": 20, "object_detection": 10,
    "focus_lost": 5, "drowsiness": 5, "gaze_off_screen": 5, "audio_detection": 2,
}

class PDF(FPDF):
    """Custom PDF class with header and footer."""
    def header(self):
        self.set_font('Helvetica', 'B', 16)
        self.cell(0, 10, 'Proctoring Report', align='C', new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(5)

    def footer(self):
        self.set_y(-15)
        self.set_font('Helvetica', 'I', 8)
        self.cell(0, 10, f'Page {self.page_no()}', align='C')

    def chapter_title(self, title):
        self.set_font('Helvetica', 'B', 12)
        self.cell(0, 10, title, new_x=XPos.LMARGIN, new_y=YPos.NEXT)
        self.ln(4)
        
    def chapter_body(self, body):
        self.set_font('Helvetica', '', 12)
        # Handle potential encoding issues for the body text
        body_cleaned = body.encode('latin-1', 'replace').decode('latin-1')
        self.multi_cell(0, 10, body_cleaned)
        self.ln()

def generate_report(session_id: str):
    """Fetches data from the API and generates a PDF report."""
    print(f"Fetching report for session: {session_id}...")
    try:
        response = requests.get(f"{API_BASE_URL}{session_id}")
        if response.status_code == 404:
            print(f"❌ Error: No session found with ID '{session_id}'.")
            return
        response.raise_for_status()
        events = response.json()
    except requests.exceptions.RequestException as e:
        print(f"❌ Error fetching data from API: {e}")
        return

    if not events:
        print("No events found for this session.")
        return

    # --- Process Data (Unchanged) ---
    df = pd.DataFrame(events)
    df['timestamp'] = pd.to_datetime(df['timestamp'])
    candidate_name = df['candidateName'].iloc[0]
    duration = df['timestamp'].max() - df['timestamp'].min()
    event_counts = df['eventType'].value_counts().to_dict()
    integrity_score = 100
    deduction_details = []
    for event, count in event_counts.items():
        deduction = DEDUCTIONS.get(event, 0) * count
        integrity_score -= deduction
        deduction_details.append(f"- {event.replace('_', ' ').title()}: {count} time(s) (-{deduction} points)")
    integrity_score = max(0, integrity_score)

    # --- Generate PDF ---
    pdf = PDF()
    pdf.add_page()
    pdf.chapter_title('Interview Summary')
    summary_text = (f"Candidate Name: {candidate_name}\nSession ID: {session_id}\n"
                    f"Interview Duration: {str(duration).split('.')[0]}\n"
                    f"Final Integrity Score: {integrity_score} / 100")
    pdf.chapter_body(summary_text)
    pdf.chapter_title('Suspicious Events Summary')
    pdf.chapter_body("\n".join(deduction_details) if deduction_details else "No suspicious events were detected.")
    
    # --- *** THE MAIN FIX IS HERE *** ---
    pdf.chapter_title('Detailed Event Log')
    pdf.set_font('Courier', '', 9)
    # Define a character width for wrapping (e.g., 100 chars for Courier font)
    wrap_width = 100 
    for index, row in df.iterrows():
        ts = row['timestamp'].strftime('%Y-%m-%d %H:%M:%S')
        log_message = f"[{ts}] [{row['eventType'].upper()}] {row['message']}"
        # Clean the string for FPDF core fonts
        log_message_cleaned = log_message.encode('latin-1', 'replace').decode('latin-1')
        
        # Manually wrap the text before passing it to the PDF library
        wrapped_lines = textwrap.wrap(log_message_cleaned, width=wrap_width, break_long_words=True, replace_whitespace=False)
        
        for line in wrapped_lines:
            pdf.multi_cell(0, 5, line)
        pdf.ln(2) # Add a small space between log entries

    file_name = f"Proctoring_Report_{candidate_name.replace(' ', '_')}_{session_id[:8]}.pdf"
    try:
        pdf.output(file_name)
        print(f"✅ Report generated successfully: {file_name}")
    except Exception as e:
        print(f"❌ Error saving PDF: {e}")

if __name__ == '__main__':
    if len(sys.argv) > 1:
        generate_report(sys.argv[1])
    else:
        print("Usage: python generate_report.py <session_id>")