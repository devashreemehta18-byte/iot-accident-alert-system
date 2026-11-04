# 🚗 CRASHGUARD IoT - Accident Alert & Telemetry System

[![Deploy with Vercel](https://vercel.com/button)](https://vercel.com/new/clone?repository-url=https%3A%2F%2Fgithub.com%2Fdevashreemehta18-byte%2Fiot-accident-alert-system)

A modern, responsive, cyber-tactical IoT Accident Alert System dashboard for vehicle safety monitoring. Built with **Arduino UNO**, **MPU6050 (6-axis accelerometer & gyroscope)**, an **Active Buzzer on Digital Pin D8**, and an emergency notification dispatcher configured for **+91 9265843734** with fixed GPS coordinates (`23.203549, 72.583860`).

Includes an official **Arduino IDE-style Serial Monitor** directly inside the dashboard with real-time bidirectional messaging, line-ending selector, baud rate dropdown, autoscroll, and timestamp controls.

---

## 📸 Key Features

- **Cyber-Tactical Dark Interface**: Deep navy palette, glowing spline wave telemetry chart, impact risk circular gauge, dark-mode incident map, and emergency perimeter shockwaves.
- **Embedded Arduino IDE Serial Monitor**:
  - Message input box with **Send** button.
  - Line ending dropdown: `Newline (\n)`, `Carriage return (\r)`, `Both NL & CR (\r\n)`, `No line ending`.
  - Baud rate selector: `9600 baud`, `19200`, `38400`, `57600`, `115200`.
  - Autoscroll toggle (`☑ Autoscroll`) and timestamp toggle (`☑ Show timestamp`).
  - Terminal clear and copy controls.
  - 1-click **Connect COM4 (Arduino Uno)** and port scanner.
- **Automated Emergency Dispatch (+91 9265843734)**:
  - Instant sliding toast notification with pre-formatted WhatsApp SOS button.
  - Real-time desktop push notifications via browser Notification API.
  - Synthesized audio siren alarm (Web Audio API).
  - Backend SMS dispatch logged in SQLite database (`data/accidents.db`).
  - Fixed GPS coordinates (`23.203549, 72.583860`) with direct Google Maps route link.
- **Universal Connection Architecture**:
  - **Local Mode**: Python Flask + PySerial reading directly from USB COM port at 9600 baud.
  - **Cloud Mode (Vercel)**: Browser-native **Web Serial API** (`navigator.serial`) allowing Chrome/Edge users to connect their physical Arduino directly from the cloud without running Python!

---

## 🛠️ Hardware Requirements & Wiring

### 1. Bill of Materials
- **Arduino UNO** (R3 or compatible with USB cable)
- **MPU-6050** 3-Axis Accelerometer and Gyroscope Module (I2C)
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

1. Connect your **Arduino UNO** via USB.
2. Open [`arduino/accident_detector/accident_detector.ino`](arduino/accident_detector/accident_detector.ino) in the **Arduino IDE**.
3. Select **Tools > Board > Arduino Uno** and **Tools > Port > COM4** (or your detected port).
4. Click **Upload** (Ctrl + U).
5. **Important**: Close the Serial Monitor inside the Arduino IDE after uploading so that the dashboard can access the COM port.

---

## 🐍 Local Backend Setup & Execution

### 1. Install Dependencies
```powershell
pip install -r requirements.txt
```

### 2. Start the Dashboard Server
```powershell
python run.py --port COM4 --baud 9600
```

### 3. Open the Dashboard
Navigate to:
```
http://localhost:5000
```

---

## 🚀 Pushing to GitHub & Deploying to Vercel

### Step 1: Create GitHub Repository
1. Open your GitHub account: [github.com/new](https://github.com/new)
2. Create a new repository named: **`iot-accident-alert-system`**
3. Leave it empty (do **not** check "Add a README file").

### Step 2: Push Local Code to GitHub
Run the following in PowerShell:
```powershell
git remote set-url origin https://github.com/devashreemehta18-byte/iot-accident-alert-system.git
git branch -M main
git push -u origin main
```

### Step 3: Deploy to Vercel
1. Log in to [vercel.com](https://vercel.com).
2. Click **Add New... > Project**.
3. Import the **`iot-accident-alert-system`** repository.
4. Vercel automatically detects `vercel.json` (configured for the `frontend` folder).
5. Click **Deploy**.
6. Open your live Vercel URL, click **🌐 Web Serial (Browser)**, pick your Arduino UNO, and stream live telemetry in Google Chrome or Microsoft Edge!
