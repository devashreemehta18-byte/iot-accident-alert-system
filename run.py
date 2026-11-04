#!/usr/bin/env python3
"""
IoT Accident Alert System - Root Launcher Script
"""

import sys
import argparse

if hasattr(sys.stdout, "reconfigure"):
    try:
        sys.stdout.reconfigure(encoding="utf-8", errors="replace")
    except Exception:
        pass

from backend import config
from backend.app import app, serial_mgr

def parse_args():
    parser = argparse.ArgumentParser(description="IoT Accident Alert System Dashboard Server")
    parser.add_argument("--port", "-p", default=None, help="Serial COM port for Arduino UNO (e.g. COM3)")
    parser.add_argument("--baud", "-b", type=int, default=9600, help="Serial baud rate (default: 9600)")
    parser.add_argument("--web-port", "-w", type=int, default=config.FLASK_PORT, help="Flask server web port (default: 5000)")
    parser.add_argument("--host", default=config.FLASK_HOST, help="Flask server host (default: 0.0.0.0)")
    return parser.parse_args()

def main():
    args = parse_args()
    if args.port:
        config.DEFAULT_PORT = args.port
        serial_mgr.port = args.port
    if args.baud:
        config.DEFAULT_BAUD = args.baud
        serial_mgr.baudrate = args.baud

    print("=" * 70)
    print("      [+] IoT ACCIDENT ALERT SYSTEM - TELEMETRY DASHBOARD [+]      ")
    print("=" * 70)
    print(f" * Target Serial Port : {serial_mgr.port} @ {serial_mgr.baudrate} baud")
    print(f" * Web Dashboard URL  : http://localhost:{args.web_port}")
    print(f" * Fixed GPS Location : {config.FIXED_LATITUDE}, {config.FIXED_LONGITUDE}")
    print(f" * Google Maps Link   : {config.GOOGLE_MAPS_URL}")
    print("=" * 70)
    print(" Press Ctrl+C in this terminal to terminate.\n")

    try:
        app.run(host=args.host, port=args.web_port, debug=False, threaded=True)
    except KeyboardInterrupt:
        print("\nStopping Serial Manager...")
        serial_mgr.stop()
        sys.exit(0)

if __name__ == "__main__":
    main()
