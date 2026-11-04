"""
Database management for Accident History Logging & SMS Dispatch Tracking
"""

import sqlite3
from datetime import datetime
from backend.config import DB_PATH, FIXED_LATITUDE, FIXED_LONGITUDE

def get_connection():
    conn = sqlite3.connect(DB_PATH)
    conn.row_factory = sqlite3.Row
    return conn

def init_db():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            CREATE TABLE IF NOT EXISTS accident_alerts (
                id INTEGER PRIMARY KEY AUTOINCREMENT,
                timestamp TEXT NOT NULL,
                peak_magnitude REAL NOT NULL,
                ax REAL NOT NULL,
                ay REAL NOT NULL,
                az REAL NOT NULL,
                latitude REAL NOT NULL,
                longitude REAL NOT NULL,
                status TEXT NOT NULL,
                google_maps_url TEXT NOT NULL,
                sms_recipient TEXT DEFAULT '+919265843734',
                sms_status TEXT DEFAULT 'SENT'
            )
        """)
        # Schema migration check: ensure columns exist in previously-created databases
        cursor.execute("PRAGMA table_info(accident_alerts)")
        existing_cols = [row[1] for row in cursor.fetchall()]
        if "sms_recipient" not in existing_cols:
            cursor.execute("ALTER TABLE accident_alerts ADD COLUMN sms_recipient TEXT DEFAULT '+919265843734'")
        if "sms_status" not in existing_cols:
            cursor.execute("ALTER TABLE accident_alerts ADD COLUMN sms_status TEXT DEFAULT 'SENT'")
        conn.commit()

def log_accident(peak_magnitude, ax, ay, az, lat=FIXED_LATITUDE, lon=FIXED_LONGITUDE, recipient="+919265843734", sms_status="SENT"):
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    maps_url = f"https://www.google.com/maps?q={lat},{lon}"
    
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            INSERT INTO accident_alerts 
            (timestamp, peak_magnitude, ax, ay, az, latitude, longitude, status, google_maps_url, sms_recipient, sms_status)
            VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
        """, (timestamp, round(float(peak_magnitude), 2), round(float(ax), 2), 
              round(float(ay), 2), round(float(az), 2), lat, lon, "ACCIDENT DETECTED", maps_url, recipient, sms_status))
        conn.commit()
        alert_id = cursor.lastrowid
        
    return {
        "id": alert_id,
        "timestamp": timestamp,
        "peak_magnitude": round(float(peak_magnitude), 2),
        "ax": round(float(ax), 2),
        "ay": round(float(ay), 2),
        "az": round(float(az), 2),
        "latitude": lat,
        "longitude": lon,
        "status": "ACCIDENT DETECTED",
        "google_maps_url": maps_url,
        "sms_recipient": recipient,
        "sms_status": sms_status
    }

def get_alerts(limit=50):
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("""
            SELECT id, timestamp, peak_magnitude, ax, ay, az, latitude, longitude, status, google_maps_url, sms_recipient, sms_status
            FROM accident_alerts
            ORDER BY id DESC
            LIMIT ?
        """, (limit,))
        return [dict(row) for row in cursor.fetchall()]

def clear_alerts():
    with get_connection() as conn:
        cursor = conn.cursor()
        cursor.execute("DELETE FROM accident_alerts")
        conn.commit()
    return True
