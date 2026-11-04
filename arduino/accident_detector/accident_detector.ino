/*
  =============================================================================
  IoT Accident Alert System - Arduino UNO Firmware
  =============================================================================
  Hardware:
    - Arduino UNO
    - MPU6050 Accelerometer & Gyroscope (I2C)
    - Active Buzzer on Digital Pin D8
    - Fixed GPS Coordinates (Reported in Telemetry):
        Latitude: 23.203549, Longitude: 72.583860

  Wiring:
    - MPU6050 VCC -> Arduino 5V (or 3.3V)
    - MPU6050 GND -> Arduino GND
    - MPU6050 SCL -> Arduino A5 (SCL)
    - MPU6050 SDA -> Arduino A4 (SDA)
    - Buzzer (+)  -> Arduino Pin D8
    - Buzzer (-)  -> Arduino GND

  Baud Rate: 9600 bps
  Output: Clean JSON telemetry packets over USB Serial
  =============================================================================
*/

#include <Wire.h>

const int BUZZER_PIN = 8;
const int STATUS_LED = 13;
const int MPU_ADDR = 0x68;

const float ACCEL_SCALE = 4096.0; // +/- 8g
const float GRAVITY = 9.80665;

// Crash Detection Thresholds (Tuned for responsive detection during impact or hand test)
const float IMPACT_THRESHOLD = 17.5;      // Total acceleration > 17.5 m/s^2 (~1.78g)
const float JERK_DELTA_THRESHOLD = 8.5;   // Sudden change in acceleration
const float TILT_ROLLOVER_THRESHOLD = 3.5;// Z-gravity drops below 3.5 m/s^2 during rollover

const unsigned long ALERT_HOLD_MS = 6000; // Hold buzzer active for at least 6 seconds

// Fixed Location
const float FIXED_LAT = 23.203549;
const float FIXED_LON = 72.583860;

float ax_ms2 = 0.0;
float ay_ms2 = 0.0;
float az_ms2 = 9.81;
float total_ms2 = 9.81;
float prev_total_ms2 = 9.81;

bool accidentDetected = false;
bool buzzerActive = false;
unsigned long alertStartTime = 0;
unsigned long lastSampleTime = 0;
const unsigned long SAMPLE_INTERVAL_MS = 100; // 10 Hz

unsigned long rolloverStartTime = 0;
bool potentialRollover = false;

bool initMPU6050() {
  Wire.begin();
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x6B); // PWR_MGMT_1
  Wire.write(0x00); // Wake up
  byte err = Wire.endTransmission();
  if (err != 0) return false;

  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x1C); // ACCEL_CONFIG
  Wire.write(0x10); // +/- 8g
  err = Wire.endTransmission();
  return (err == 0);
}

bool readMPU6050() {
  Wire.beginTransmission(MPU_ADDR);
  Wire.write(0x3B);
  if (Wire.endTransmission(false) != 0) return false;

  if (Wire.requestFrom(MPU_ADDR, 6, true) != 6) return false;

  int16_t raw_ax = (Wire.read() << 8) | Wire.read();
  int16_t raw_ay = (Wire.read() << 8) | Wire.read();
  int16_t raw_az = (Wire.read() << 8) | Wire.read();

  ax_ms2 = ((float)raw_ax / ACCEL_SCALE) * GRAVITY;
  ay_ms2 = ((float)raw_ay / ACCEL_SCALE) * GRAVITY;
  az_ms2 = ((float)raw_az / ACCEL_SCALE) * GRAVITY;

  total_ms2 = sqrt(ax_ms2 * ax_ms2 + ay_ms2 * ay_ms2 + az_ms2 * az_ms2);
  return true;
}

void setup() {
  Serial.begin(9600);
  while (!Serial && millis() < 2500);

  pinMode(BUZZER_PIN, OUTPUT);
  pinMode(STATUS_LED, OUTPUT);
  digitalWrite(BUZZER_PIN, LOW);
  digitalWrite(STATUS_LED, LOW);

  initMPU6050();
}

void loop() {
  unsigned long currentMillis = millis();

  if (currentMillis - lastSampleTime >= SAMPLE_INTERVAL_MS) {
    lastSampleTime = currentMillis;

    bool readSuccess = readMPU6050();
    if (!readSuccess) {
      initMPU6050();
      return;
    }

    // 1. High impact spike
    bool impactSpike = (total_ms2 >= IMPACT_THRESHOLD);

    // 2. Sudden jerk
    float delta_a = abs(total_ms2 - prev_total_ms2);
    bool suddenJerk = (delta_a >= JERK_DELTA_THRESHOLD && total_ms2 > 15.0);

    // 3. Rollover / Inversion
    if (abs(az_ms2) < TILT_ROLLOVER_THRESHOLD && (abs(ax_ms2) > 5.0 || abs(ay_ms2) > 5.0)) {
      if (!potentialRollover) {
        rolloverStartTime = currentMillis;
        potentialRollover = true;
      } else if (currentMillis - rolloverStartTime > 1000) {
        impactSpike = true;
      }
    } else {
      potentialRollover = false;
    }

    // Latch Alert
    if (impactSpike || suddenJerk) {
      accidentDetected = true;
      alertStartTime = currentMillis;
    }

    if (accidentDetected) {
      if (currentMillis - alertStartTime < ALERT_HOLD_MS) {
        buzzerActive = true;
        digitalWrite(BUZZER_PIN, HIGH);
        digitalWrite(STATUS_LED, HIGH);
      } else {
        if (total_ms2 < IMPACT_THRESHOLD && !potentialRollover) {
          accidentDetected = false;
          buzzerActive = false;
          digitalWrite(BUZZER_PIN, LOW);
          digitalWrite(STATUS_LED, LOW);
        }
      }
    } else {
      buzzerActive = false;
      digitalWrite(BUZZER_PIN, LOW);
      digitalWrite(STATUS_LED, LOW);
    }

    prev_total_ms2 = total_ms2;

    // Send JSON packet
    Serial.print(F("{\"ax\":"));
    Serial.print(ax_ms2, 2);
    Serial.print(F(",\"ay\":"));
    Serial.print(ay_ms2, 2);
    Serial.print(F(",\"az\":"));
    Serial.print(az_ms2, 2);
    Serial.print(F(",\"total\":"));
    Serial.print(total_ms2, 2);
    Serial.print(F(",\"status\":\""));
    Serial.print(accidentDetected ? F("ACCIDENT DETECTED") : F("NORMAL"));
    Serial.print(F("\",\"buzzer\":\""));
    Serial.print(buzzerActive ? F("ON") : F("OFF"));
    Serial.print(F("\",\"lat\":"));
    Serial.print(FIXED_LAT, 6);
    Serial.print(F(",\"lon\":"));
    Serial.print(FIXED_LON, 6);
    Serial.println(F("}"));
  }
}

