"""
Serial Manager for Arduino UNO USB Communication
Handles PySerial reading, universal telemetry parsing, auto-reconnect, and SSE broadcasting.
"""

import time
import json
import re
import threading
import queue
import logging
import serial
import serial.tools.list_ports
from datetime import datetime

from backend.config import (
    DEFAULT_PORT,
    DEFAULT_BAUD,
    FIXED_LATITUDE,
    FIXED_LONGITUDE,
    GOOGLE_MAPS_URL
)
from backend import database

logging.basicConfig(level=logging.INFO, format="%(asctime)s [%(levelname)s] %(message)s")
logger = logging.getLogger("SerialManager")

class SerialManager:
    def __init__(self):
        self.port = DEFAULT_PORT
        self.baudrate = DEFAULT_BAUD
        self.ser = None
        self.is_connected = False
        self.auto_reconnect = True
        self.stop_event = threading.Event()
        self.thread = None
        self.lock = threading.Lock()

        # Telemetry State
        self.telemetry = {
            "connected": False,
            "port": None,
            "baudrate": self.baudrate,
            "ax": 0.0,
            "ay": 0.0,
            "az": 9.81,
            "total": 9.81,
            "status": "NORMAL",  # "NORMAL", "ACCIDENT DETECTED", "DISCONNECTED"
            "buzzer": "OFF",     # "ON", "OFF"
            "lat": FIXED_LATITUDE,
            "lon": FIXED_LONGITUDE,
            "maps_url": GOOGLE_MAPS_URL,
            "packet_count": 0,
            "last_packet_time": None,
            "last_error": None,
            "mode": "HARDWARE",
            "raw": ""
        }

        self.listeners = []
        self.listeners_lock = threading.Lock()

        self.last_status = "NORMAL"
        self.peak_in_current_alert = 0.0
        self.accident_latched_until = 0.0

        self.serial_logs = []
        self.max_logs = 60

        self.simulation_active = False
        self.sim_thread = None

    def list_ports(self):
        ports = []
        try:
            available = serial.tools.list_ports.comports()
            for p in available:
                is_arduino = any(k in (p.description or "").lower() or k in (p.manufacturer or "").lower() 
                                 for k in ["arduino", "ch340", "ftdi", "usb serial", "cp210"])
                ports.append({
                    "port": p.device,
                    "description": p.description or "Serial Device",
                    "manufacturer": p.manufacturer or "Unknown",
                    "hwid": p.hwid or "",
                    "is_recommended": is_arduino
                })
        except Exception as e:
            logger.error(f"Error enumerating ports: {e}")
        return ports

    def start(self):
        self.stop_event.clear()
        if self.thread is None or not self.thread.is_alive():
            self.thread = threading.Thread(target=self._worker_loop, daemon=True, name="SerialReader")
            self.thread.start()
            logger.info("Serial background worker started.")

    def stop(self):
        self.stop_event.set()
        self.stop_simulation()
        self._close_serial()
        if self.thread and self.thread.is_alive():
            self.thread.join(timeout=2.0)
        logger.info("Serial manager stopped.")

    def connect(self, port=None, baudrate=None):
        self.stop_simulation()
        with self.lock:
            if port:
                self.port = port
            if baudrate:
                self.baudrate = int(baudrate)
        self._close_serial()
        return self._try_open_port()

    def disconnect(self):
        self.stop_simulation()
        self.auto_reconnect = False
        self._close_serial()
        with self.lock:
            self.telemetry["connected"] = False
            self.telemetry["status"] = "DISCONNECTED"
            self.telemetry["buzzer"] = "OFF"
            self.telemetry["last_error"] = "Manually disconnected"
            self.telemetry["mode"] = "HARDWARE"
        self._append_log("Port disconnected by user request.", "system")
        self._broadcast(self.get_telemetry())
        return True

    def _close_serial(self):
        if self.ser:
            try:
                self.ser.close()
            except Exception:
                pass
            finally:
                self.ser = None
        self.is_connected = False

    def _try_open_port(self):
        try:
            logger.info(f"Connecting to {self.port} @ {self.baudrate} baud...")
            self.ser = serial.Serial(
                port=self.port,
                baudrate=self.baudrate,
                timeout=1.0,
                write_timeout=1.0
            )
            time.sleep(1.8)
            self.ser.reset_input_buffer()
            self.is_connected = True
            
            with self.lock:
                self.telemetry["connected"] = True
                self.telemetry["port"] = self.port
                self.telemetry["baudrate"] = self.baudrate
                self.telemetry["status"] = "NORMAL"
                self.telemetry["buzzer"] = "OFF"
                self.telemetry["last_error"] = None
                self.telemetry["mode"] = "HARDWARE"

            msg = f"Connected to {self.port} @ {self.baudrate} baud."
            logger.info(msg)
            self._append_log(msg, "success")
            self._broadcast(self.get_telemetry())
            return True, msg
        except (serial.SerialException, OSError) as e:
            err_msg = str(e)
            logger.warning(f"Could not open {self.port}: {err_msg}")
            self._close_serial()
            with self.lock:
                self.telemetry["connected"] = False
                self.telemetry["status"] = "DISCONNECTED"
                self.telemetry["buzzer"] = "OFF"
                self.telemetry["last_error"] = err_msg
                self.telemetry["mode"] = "HARDWARE"
            self._append_log(f"Connection failed ({self.port}): {err_msg}", "error")
            self._broadcast(self.get_telemetry())
            return False, err_msg

    def _worker_loop(self):
        while not self.stop_event.is_set():
            if not self.is_connected:
                if self.auto_reconnect and not self.simulation_active:
                    ports = self.list_ports()
                    available_names = [p["port"] for p in ports]
                    if self.port in available_names:
                        self._try_open_port()
                    else:
                        recommended = [p["port"] for p in ports if p["is_recommended"]]
                        if recommended:
                            self.port = recommended[0]
                            self._try_open_port()

                time.sleep(2.0)
                continue

            try:
                if not self.ser or not self.ser.is_open:
                    raise serial.SerialException("Serial port is closed.")

                line = self.ser.readline()
                if not line:
                    continue

                line_str = line.decode("utf-8", errors="replace").strip()
                if not line_str:
                    continue

                self._process_serial_line(line_str)

            except (serial.SerialException, OSError) as e:
                logger.warning(f"Serial connection lost ({self.port}): {e}.")
                self._close_serial()
                with self.lock:
                    self.telemetry["connected"] = False
                    self.telemetry["status"] = "DISCONNECTED"
                    self.telemetry["buzzer"] = "OFF"
                    self.telemetry["last_error"] = f"Connection lost: {str(e)}"
                    self.telemetry["mode"] = "HARDWARE"
                self._append_log(f"Hardware disconnected on {self.port}.", "error")
                self._broadcast(self.get_telemetry())
                time.sleep(1.5)
            except Exception as e:
                logger.error(f"Error in serial loop: {e}")
                time.sleep(0.5)

    def _process_serial_line(self, line_str):
        now = time.time()
        now_dt = datetime.now()
        timestamp_str = now_dt.strftime("%Y-%m-%d %H:%M:%S")

        parsed_data = self._universal_parse(line_str)
        if not parsed_data:
            return

        ax = parsed_data.get("ax", 0.0)
        ay = parsed_data.get("ay", 0.0)
        az = parsed_data.get("az", 9.81)
        total = parsed_data.get("total", 9.81)
        raw_status = parsed_data.get("status", "NORMAL")
        raw_buzzer = parsed_data.get("buzzer", "OFF")

        # 1. Buzzer Normalization
        is_buzzer_active = False
        if isinstance(raw_buzzer, bool):
            is_buzzer_active = raw_buzzer
        elif isinstance(raw_buzzer, (int, float)):
            is_buzzer_active = (raw_buzzer > 0)
        elif isinstance(raw_buzzer, str):
            clean_b = raw_buzzer.strip().upper()
            is_buzzer_active = clean_b in ["ON", "TRUE", "1", "HIGH", "ACTIVE"]

        # 2. Accident Normalization
        is_accident_active = False
        if isinstance(raw_status, bool):
            is_accident_active = raw_status
        elif isinstance(raw_status, (int, float)):
            is_accident_active = (raw_status > 0)
        elif isinstance(raw_status, str):
            clean_s = raw_status.strip().upper()
            is_accident_active = any(w in clean_s for w in ["ACCIDENT", "CRASH", "EMERGENCY", "IMPACT"])

        # 3. Hardware Safety Threshold Fallback:
        # If total acceleration >= 17.5 m/s^2 or buzzer is active, trigger and latch accident alert!
        if total >= 17.5 or abs(ax) >= 14.0 or abs(ay) >= 14.0 or is_buzzer_active:
            is_accident_active = True
            is_buzzer_active = True
            self.accident_latched_until = now + 6.0

        if now < self.accident_latched_until:
            is_accident_active = True
            is_buzzer_active = True

        status = "ACCIDENT DETECTED" if is_accident_active else "NORMAL"
        buzzer = "ON" if is_buzzer_active else "OFF"

        with self.lock:
            self.telemetry["connected"] = True
            self.telemetry["port"] = self.port
            self.telemetry["baudrate"] = self.baudrate
            self.telemetry["ax"] = round(ax, 2)
            self.telemetry["ay"] = round(ay, 2)
            self.telemetry["az"] = round(az, 2)
            self.telemetry["total"] = round(total, 2)
            self.telemetry["status"] = status
            self.telemetry["buzzer"] = buzzer
            self.telemetry["lat"] = FIXED_LATITUDE
            self.telemetry["lon"] = FIXED_LONGITUDE
            self.telemetry["maps_url"] = GOOGLE_MAPS_URL
            self.telemetry["packet_count"] += 1
            self.telemetry["last_packet_time"] = timestamp_str
            self.telemetry["raw"] = line_str
            self.telemetry["mode"] = "HARDWARE"

            if status == "ACCIDENT DETECTED":
                if total > self.peak_in_current_alert:
                    self.peak_in_current_alert = total

                if self.last_status != "ACCIDENT DETECTED":
                    logger.warning(f"CRITICAL ACCIDENT: {total:.2f} m/s^2 | Buzzer: {buzzer}")
                    try:
                        database.log_accident(total, ax, ay, az, FIXED_LATITUDE, FIXED_LONGITUDE)
                    except Exception as db_err:
                        logger.error(f"Database logging failed: {db_err}")

                    self._append_log(f"CRITICAL ACCIDENT: {total:.2f} m/s^2 | Pin D8 Buzzer: ON", "alert")
            else:
                self.peak_in_current_alert = 0.0

            self.last_status = status

        if self.telemetry["packet_count"] % 10 == 0 and status == "NORMAL":
            self._append_log(f"X:{ax:.2f} | Y:{ay:.2f} | Z:{az:.2f} | Total:{total:.2f} m/s^2 | Buzzer:{buzzer}", "normal")

        self._broadcast(self.get_telemetry())

    def _universal_parse(self, line_str):
        # 1. JSON parse
        try:
            data = json.loads(line_str)
            if isinstance(data, dict):
                ax = float(data.get("ax", 0.0))
                ay = float(data.get("ay", 0.0))
                az = float(data.get("az", 9.81))
                total = float(data.get("total", (ax**2 + ay**2 + az**2)**0.5))
                return {
                    "ax": ax, "ay": ay, "az": az, "total": total,
                    "status": data.get("status", "NORMAL"),
                    "buzzer": data.get("buzzer", "OFF")
                }
        except (json.JSONDecodeError, ValueError):
            pass

        # 2. Text / regex fallback
        status = "NORMAL"
        buzzer = "OFF"
        upper_line = line_str.upper()

        if any(w in upper_line for w in ["ACCIDENT", "CRASH", "EMERGENCY"]):
            status = "ACCIDENT DETECTED"
        if any(w in upper_line for w in ["BUZZER: ON", "BUZZER ON", "BUZZER:ON", "BUZZER=ON"]):
            buzzer = "ON"

        nums = [float(x) for x in re.findall(r"[-+]?\d*\.\d+|\d+", line_str)]
        if len(nums) >= 3:
            ax, ay, az = nums[0], nums[1], nums[2]
            total = nums[3] if len(nums) >= 4 else (ax**2 + ay**2 + az**2)**0.5
            return {
                "ax": ax, "ay": ay, "az": az, "total": total,
                "status": status, "buzzer": buzzer
            }

        if status == "ACCIDENT DETECTED" or buzzer == "ON":
            return {"ax": 20.0, "ay": 10.0, "az": 8.0, "total": 23.5, "status": status, "buzzer": buzzer}

        return None

    def _append_log(self, text, log_type="normal"):
        timestamp = datetime.now().strftime("%H:%M:%S")
        with self.lock:
            self.serial_logs.append({"time": timestamp, "text": text, "type": log_type})
            if len(self.serial_logs) > self.max_logs:
                self.serial_logs.pop(0)

    def get_telemetry(self):
        with self.lock:
            data = dict(self.telemetry)
            data["logs"] = list(self.serial_logs[-15:])
            return data

    def subscribe(self):
        q = queue.Queue(maxsize=100)
        with self.listeners_lock:
            self.listeners.append(q)
        try:
            q.put_nowait(self.get_telemetry())
        except queue.Full:
            pass
        return q

    def unsubscribe(self, q):
        with self.listeners_lock:
            if q in self.listeners:
                self.listeners.remove(q)

    def _broadcast(self, data):
        with self.listeners_lock:
            for q in list(self.listeners):
                try:
                    q.put_nowait(data)
                except queue.Full:
                    try:
                        q.get_nowait()
                        q.put_nowait(data)
                    except Exception:
                        pass

    def toggle_simulation(self):
        if self.is_connected:
            return False, "Cannot start simulation while real Arduino is connected."

        if self.simulation_active:
            self.stop_simulation()
            return True, "Simulation stopped."
        else:
            self.start_simulation()
            return True, "Simulation started."

    def start_simulation(self):
        if self.is_connected:
            return
        self.simulation_active = True
        self.sim_thread = threading.Thread(target=self._simulation_loop, daemon=True, name="SimLoop")
        self.sim_thread.start()

    def stop_simulation(self):
        self.simulation_active = False
        with self.lock:
            if self.telemetry["mode"] == "SIMULATION":
                self.telemetry["connected"] = False
                self.telemetry["status"] = "DISCONNECTED"
                self.telemetry["buzzer"] = "OFF"
                self.telemetry["mode"] = "HARDWARE"
        self._broadcast(self.get_telemetry())

    def _simulation_loop(self):
        import math
        import random

        step = 0
        accident_countdown = 0

        while self.simulation_active and not self.is_connected and not self.stop_event.is_set():
            step += 1
            now_str = datetime.now().strftime("%Y-%m-%d %H:%M:%S")

            base_ax = math.sin(step * 0.1) * 0.6 + random.uniform(-0.15, 0.15)
            base_ay = math.cos(step * 0.08) * 0.4 + random.uniform(-0.15, 0.15)
            base_az = 9.81 + random.uniform(-0.25, 0.25)
            status = "NORMAL"
            buzzer = "OFF"

            if step % 220 == 0:
                accident_countdown = 35

            if accident_countdown > 0:
                accident_countdown -= 1
                base_ax = random.uniform(20.0, 32.0)
                base_ay = random.uniform(-14.0, 18.0)
                base_az = random.uniform(5.0, 15.0)
                status = "ACCIDENT DETECTED"
                buzzer = "ON"

            total = math.sqrt(base_ax**2 + base_ay**2 + base_az**2)

            with self.lock:
                self.telemetry["connected"] = False
                self.telemetry["port"] = "DEMO-MODE"
                self.telemetry["baudrate"] = 9600
                self.telemetry["ax"] = round(base_ax, 2)
                self.telemetry["ay"] = round(base_ay, 2)
                self.telemetry["az"] = round(base_az, 2)
                self.telemetry["total"] = round(total, 2)
                self.telemetry["status"] = status
                self.telemetry["buzzer"] = buzzer
                self.telemetry["packet_count"] += 1
                self.telemetry["last_packet_time"] = now_str
                self.telemetry["mode"] = "SIMULATION"

                if status == "ACCIDENT DETECTED" and self.last_status != "ACCIDENT DETECTED":
                    database.log_accident(total, base_ax, base_ay, base_az)
                    self._append_log(f"SIMULATION CRASH DETECTED: {total:.2f} m/s^2 | Buzzer: ON", "alert")
                elif step % 15 == 0:
                    self._append_log(f"X:{base_ax:.2f} | Y:{base_ay:.2f} | Z:{base_az:.2f} | Total:{total:.2f} m/s^2 | Buzzer: OFF", "normal")

                self.last_status = status

            self._broadcast(self.get_telemetry())
            time.sleep(0.1)
