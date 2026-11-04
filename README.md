# 🚗 IoT Accident Alert System - Telemetry Dashboard

A modern, responsive IoT Accident Alert System dashboard for vehicle safety monitoring. Built with **Arduino UNO**, **MPU6050 (6-axis accelerometer & gyroscope)**, an **Active Buzzer on Pin D8**, and a **Python Flask backend** reading live USB Serial telemetry via **PySerial**.

Features a cyber-tactical layout matching enterprise telemetry dashboards with real-time waveform charts, circular G-force impact donut meter, live tactical GPS incident mapping, and an embedded user-friendly serial monitor.

---

## 🛠️ Hardware Requirements & Wiring

### 1. Bill of Materials
- **Arduino UNO** (R3 or compatible with USB cable)
- **MPU-6050** 3-Axis Accelerometer and Gyroscope Module
- **Active 5V Buzzer**
- Jumper wires and breadboard

### 2. Pinout Connections

| Arduino UNO Pin | Component | Component Pin | Description |
|:---|:---|:---|:---|
| **5V** or **3.3V** | MPU6050 | `VCC` | Power supply |
| **GND** | MPU6050 | `GND` | Ground |
| **Analog A4** | MPU6050 | `SDA` | I2C Data line |
| **Analog A5** | MPU6050 | `SCL` | I2C Clock line |
| **Digital Pin 8** | Active Buzzer | Positive `(+)` / Long Leg | Driven HIGH during accident |
| **GND** | Active Buzzer | Negative `(-)` / Short Leg| Ground |

---

## ⚡ Arduino Firmware Installation

The Arduino sketch uses the built-in `Wire.h` library to read raw accelerometer registers directly from the MPU6050 (I2C address `0x68`) configured for $\pm 8\text{g}$ dynamic range.

1. Open the **Arduino IDE**.
2. Connect your **Arduino UNO** via USB.
3. Open [`arduino/accident_detector/accident_detector.ino`](arduino/accident_detector/accident_detector.ino).
4. Select **Tools > Board > Arduino Uno** and **Tools > Port > your Arduino COM port**.
5. Click **Upload** (Ctrl + U).
6. *(Close the Arduino Serial Monitor before running the Python dashboard, as only one program can access the COM port at a time).*

---

## 🐍 Backend Setup & Execution

### 1. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 2. Start the Dashboard Server
```powershell
python run.py
```
Or specify your COM port:
```powershell
python run.py --port COM3 --baud 9600
```

### 3. Open the Dashboard
Open your browser and navigate to:
```
http://localhost:5000
```

---

## 🚀 Deploying to Vercel (With Web Serial Support)

Because this dashboard includes browser-native **Web Serial API** support (`navigator.serial`), you can deploy this repository to **Vercel** and connect to your Arduino UNO directly through your web browser (Google Chrome or Microsoft Edge) with zero software installation!

1. Push this repository to your GitHub:
   ```powershell
   git remote add origin https://github.com/devashreemehta18-byte/iot-accident-alert-system.git
   git branch -M main
   git push -u origin main
   ```
2. In [Vercel](https://vercel.com), click **Add New... > Project** and import `iot-accident-alert-system`.
3. Vercel automatically detects `vercel.json` with the output directory `frontend`. Click **Deploy**.
4. Open the deployed Vercel link, click **Connect Arduino**, select your Arduino UNO COM port, and stream live hardware telemetry!
