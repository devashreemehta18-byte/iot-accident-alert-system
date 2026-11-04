"""
Flask Application for IoT Accident Alert System Dashboard
"""

import os
import json
import csv
import io
from flask import Flask, jsonify, request, Response, send_from_directory
from flask_cors import CORS

from backend.config import (
    STATIC_DIR,
    FLASK_HOST,
    FLASK_PORT,
    FIXED_LATITUDE,
    FIXED_LONGITUDE,
    GOOGLE_MAPS_URL,
    DEFAULT_PORT,
    DEFAULT_BAUD,
    SUPPORTED_BAUDS
)
from backend.serial_manager import SerialManager
from backend import database
from backend import notifier

database.init_db()

serial_mgr = SerialManager()
serial_mgr.start()

app = Flask(
    __name__,
    static_folder=STATIC_DIR,
    static_url_path=""
)
CORS(app)

@app.route("/")
def index():
    return send_from_directory(STATIC_DIR, "index.html")

@app.route("/<path:filename>")
def serve_static(filename):
    return send_from_directory(STATIC_DIR, filename)

@app.route("/api/status", methods=["GET"])
def get_status():
    telemetry = serial_mgr.get_telemetry()
    return jsonify({
        "success": True,
        "telemetry": telemetry,
        "emergency": {
            "recipient": notifier.EMERGENCY_PHONE,
            "raw_phone": notifier.RAW_PHONE,
            "whatsapp_url": notifier.get_whatsapp_url(),
            "fixed_location": {
                "latitude": FIXED_LATITUDE,
                "longitude": FIXED_LONGITUDE,
                "google_maps_url": GOOGLE_MAPS_URL
            }
        },
        "system": {
            "supported_bauds": SUPPORTED_BAUDS,
            "default_port": DEFAULT_PORT,
            "default_baud": DEFAULT_BAUD
        }
    })

@app.route("/api/notify", methods=["POST"])
def manual_notify():
    """Manually test or trigger SMS and WhatsApp notification dispatch."""
    data = request.get_json(silent=True) or {}
    peak = float(data.get("peak", 25.4))
    res = notifier.dispatch_sms_notification(peak)
    return jsonify({"success": True, "dispatch": res})

@app.route("/api/ports", methods=["GET"])
def get_ports():
    ports = serial_mgr.list_ports()
    return jsonify({
        "success": True,
        "ports": ports,
        "current_port": serial_mgr.port,
        "current_baud": serial_mgr.baudrate,
        "is_connected": serial_mgr.is_connected
    })

@app.route("/api/connect", methods=["POST"])
def connect_port():
    data = request.get_json(silent=True) or {}
    port = data.get("port")
    baudrate = data.get("baudrate", 9600)

    if not port:
        return jsonify({"success": False, "error": "Port is required."}), 400

    success, message = serial_mgr.connect(port=port, baudrate=int(baudrate))
    return jsonify({
        "success": success,
        "message": message,
        "connected": serial_mgr.is_connected,
        "port": serial_mgr.port,
        "baudrate": serial_mgr.baudrate
    })

@app.route("/api/disconnect", methods=["POST"])
def disconnect_port():
    serial_mgr.disconnect()
    return jsonify({"success": True, "message": "Disconnected safely.", "connected": False})

@app.route("/api/alerts", methods=["GET"])
def get_alerts():
    limit = request.args.get("limit", 50, type=int)
    alerts = database.get_alerts(limit=limit)
    return jsonify({"success": True, "count": len(alerts), "alerts": alerts})

@app.route("/api/alerts", methods=["DELETE"])
def clear_alerts():
    database.clear_alerts()
    return jsonify({"success": True, "message": "Alert history cleared."})

@app.route("/api/alerts/export", methods=["GET"])
def export_alerts_csv():
    alerts = database.get_alerts(limit=500)
    output = io.StringIO()
    writer = csv.writer(output)
    writer.writerow(["ID", "Timestamp", "Peak Magnitude (m/s²)", "Acc X", "Acc Y", "Acc Z", "Lat", "Lon", "Status", "Maps URL", "SMS Recipient", "SMS Status"])
    for a in alerts:
        writer.writerow([
            a.get("id"), a.get("timestamp"), a.get("peak_magnitude"),
            a.get("ax"), a.get("ay"), a.get("az"),
            a.get("latitude"), a.get("longitude"),
            a.get("status"), a.get("google_maps_url"),
            a.get("sms_recipient", "+919265843734"), a.get("sms_status", "SENT")
        ])

    return Response(
        output.getvalue(),
        mimetype="text/csv",
        headers={"Content-Disposition": "attachment; filename=accident_alerts.csv"}
    )

@app.route("/api/simulation/toggle", methods=["POST"])
def toggle_simulation():
    success, msg = serial_mgr.toggle_simulation()
    return jsonify({"success": success, "message": msg, "simulation_active": serial_mgr.simulation_active})

@app.route("/api/stream")
def sse_stream():
    def event_generator():
        client_queue = serial_mgr.subscribe()
        try:
            while True:
                try:
                    data = client_queue.get(timeout=1.5)
                    yield f"data: {json.dumps(data)}\n\n"
                except Exception:
                    yield ": ping\n\n"
        finally:
            serial_mgr.unsubscribe(client_queue)

    return Response(event_generator(), mimetype="text/event-stream", headers={"Cache-Control": "no-cache", "Connection": "keep-alive"})

if __name__ == "__main__":
    app.run(host=FLASK_HOST, port=FLASK_PORT, debug=False, threaded=True)
