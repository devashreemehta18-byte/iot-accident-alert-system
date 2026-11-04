"""
IoT Accident Alert System - Configuration Module
"""

import os

BASE_DIR = os.path.abspath(os.path.join(os.path.dirname(__file__), ".."))
DATA_DIR = os.path.join(BASE_DIR, "data")
STATIC_DIR = os.path.join(BASE_DIR, "frontend")

os.makedirs(DATA_DIR, exist_ok=True)

# Serial communication defaults
DEFAULT_PORT = os.environ.get("SERIAL_PORT", "COM3")
DEFAULT_BAUD = int(os.environ.get("SERIAL_BAUD", 9600))
SUPPORTED_BAUDS = [9600, 19200, 38400, 57600, 115200]

# Fixed GPS coordinates
FIXED_LATITUDE = 23.203549
FIXED_LONGITUDE = 72.583860
GOOGLE_MAPS_URL = f"https://www.google.com/maps?q={FIXED_LATITUDE},{FIXED_LONGITUDE}"

# Database path
DB_PATH = os.path.join(DATA_DIR, "accidents.db")

FLASK_HOST = "0.0.0.0"
FLASK_PORT = int(os.environ.get("PORT", 5000))

