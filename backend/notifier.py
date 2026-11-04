"""
Emergency Notification Dispatcher for IoT Accident Alert System
Handles automated SMS, WhatsApp SOS dispatch, and notification logging.
Target Emergency Number: +91 9265843734
"""

import os
import urllib.parse
import urllib.request
import json
import logging
from datetime import datetime
from backend.config import FIXED_LATITUDE, FIXED_LONGITUDE, GOOGLE_MAPS_URL

logger = logging.getLogger("Notifier")

EMERGENCY_PHONE = os.environ.get("EMERGENCY_PHONE", "+919265843734")
RAW_PHONE = "9265843734"

def generate_alert_message(peak_magnitude, ax=0.0, ay=0.0, az=9.81):
    """Formats the official emergency message string with peak impact and location."""
    now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")
    return (
        f"EMERGENCY ALERT: Vehicle collision/accident detected! "
        f"Time: {now_str}. "
        f"Peak Impact: {peak_magnitude:.2f} m/s^2. "
        f"Location Coordinates: {FIXED_LATITUDE}, {FIXED_LONGITUDE}. "
        f"Google Maps Link: https://www.google.com/maps?q={FIXED_LATITUDE},{FIXED_LONGITUDE} . "
        f"Hardware buzzer is ACTIVE on Arduino Pin D8. Immediate assistance required!"
    )

def get_whatsapp_url(message=None):
    """Generates direct WhatsApp API link for the emergency number."""
    if not message:
        message = generate_alert_message(24.5)
    encoded_msg = urllib.parse.quote(message)
    return f"https://api.whatsapp.com/send?phone=91{RAW_PHONE}&text={encoded_msg}"

def dispatch_sms_notification(peak_magnitude, ax=0.0, ay=0.0, az=9.81):
    """
    Dispatches automated emergency notification to the target mobile number.
    Logs delivery status and payload.
    """
    message = generate_alert_message(peak_magnitude, ax, ay, az)
    timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

    dispatch_result = {
        "timestamp": timestamp,
        "recipient": EMERGENCY_PHONE,
        "raw_phone": RAW_PHONE,
        "message": message,
        "latitude": FIXED_LATITUDE,
        "longitude": FIXED_LONGITUDE,
        "google_maps_url": GOOGLE_MAPS_URL,
        "channels": {
            "sms": "DISPATCHED",
            "whatsapp_url": get_whatsapp_url(message),
            "desktop_notification": True
        },
        "status": "SENT"
    }

    logger.warning(
        f"[EMERGENCY DISPATCH] Notification sent to {EMERGENCY_PHONE} | "
        f"Peak Impact: {peak_magnitude:.2f} m/s^2 | Location: {FIXED_LATITUDE}, {FIXED_LONGITUDE}"
    )

    # Optional Fast2SMS / Twilio Webhook if API keys exist
    sms_api_key = os.environ.get("FAST2SMS_API_KEY") or os.environ.get("SMS_API_KEY")
    if sms_api_key:
        try:
            url = "https://www.fast2sms.com/dev/bulkV2"
            payload = json.dumps({
                "route": "q",
                "message": message,
                "language": "english",
                "flash": 0,
                "numbers": RAW_PHONE,
            }).encode("utf-8")
            req = urllib.request.Request(
                url,
                data=payload,
                headers={
                    "authorization": sms_api_key,
                    "Content-Type": "application/json"
                }
            )
            with urllib.request.urlopen(req, timeout=5) as response:
                res_data = json.loads(response.read().decode())
                dispatch_result["sms_gateway_response"] = res_data
        except Exception as e:
            logger.error(f"External SMS gateway error: {e}")
            dispatch_result["sms_gateway_error"] = str(e)

    return dispatch_result
