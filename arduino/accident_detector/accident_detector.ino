/*
  =============================================================================
  IoT Accident Alert System - Arduino UNO Firmware (Adafruit_MPU6050)
  =============================================================================
  Hardware:
    - Arduino UNO
    - MPU6050 Accelerometer & Gyroscope (Adafruit_MPU6050)
    - Active Buzzer on Digital Pin D8
    - Fixed GPS: Karnavati University, Uvarsad (23.203549, 72.583860)

  Wiring:
    - MPU6050 VCC -> Arduino 5V
    - MPU6050 GND -> Arduino GND
    - MPU6050 SDA -> Arduino A4
    - MPU6050 SCL -> Arduino A5
    - Buzzer (+)  -> Arduino Pin D8
    - Buzzer (-)  -> Arduino GND

  Baud Rate: 9600 bps
  Bidirectional Serial:
    - Emits live "Acceleration Magnitude: <float>"
    - Emits formatted "ACCIDENT DETECTED!" with Google Maps link
    - Listens for serial commands: "RESET", "PING", "STATUS"
  =============================================================================
*/

#include <Wire.h>
#include <Adafruit_MPU6050.h>
#include <Adafruit_Sensor.h>
#include <math.h>

Adafruit_MPU6050 mpu;

#define BUZZER 8
#define ACCIDENT_THRESHOLD 20.0

bool accidentDetected = false;

// Fixed location: Karnavati University, Uvarsad
double latitude = 23.203549;
double longitude = 72.583860;

void setup() {
  Serial.begin(9600);
  Wire.begin();

  pinMode(BUZZER, OUTPUT);
  digitalWrite(BUZZER, LOW);

  Serial.println("================================");
  Serial.println("   IoT ACCIDENT ALERT SYSTEM");
  Serial.println("================================");

  if (!mpu.begin()) {
    Serial.println("MPU6050 NOT DETECTED!");
    while (1) {
      digitalWrite(BUZZER, LOW);
      delay(100);
    }
  }

  // Configure Accelerometer Range (+/- 8G) & Filter Bandwidth (21 Hz)
  mpu.setAccelerometerRange(MPU6050_RANGE_8_G);
  mpu.setFilterBandwidth(MPU6050_BAND_21_HZ);

  Serial.println("MPU6050 Connected Successfully!");
  Serial.println("Fixed Location Initialized!");
  Serial.println("Accident Monitoring Started!");
  Serial.println("System Status: NORMAL");
}

void loop() {
  // 1. Process Incoming Serial Commands (from Dashboard IDE Serial Monitor)
  if (Serial.available() > 0) {
    String cmd = Serial.readStringUntil('\n');
    cmd.trim();
    cmd.toUpperCase();
    if (cmd == "RESET" || cmd == "R" || cmd == "CLEAR") {
      accidentDetected = false;
      digitalWrite(BUZZER, LOW);
      Serial.println("System Status: NORMAL");
    } else if (cmd == "PING") {
      Serial.println("PONG - Arduino Uno Online");
    } else if (cmd == "STATUS") {
      Serial.print("System Status: ");
      Serial.println(accidentDetected ? "ACCIDENT DETECTED" : "NORMAL");
    }
  }

  // 2. Read MPU6050 Sensor Event
  sensors_event_t a, g, temp;
  mpu.getEvent(&a, &g, &temp);

  float x = a.acceleration.x;
  float y = a.acceleration.y;
  float z = a.acceleration.z;

  float total = sqrt(x*x + y*y + z*z);

  Serial.print("Acceleration Magnitude: ");
  Serial.println(total);

  // 3. Collision Impact Detection
  if (total > ACCIDENT_THRESHOLD && !accidentDetected) {
    accidentDetected = true;

    Serial.println();
    Serial.println("********************************");
    Serial.println("       ACCIDENT DETECTED!");
    Serial.println("********************************");

    Serial.println("LOCATION DETAILS:");

    Serial.print("Latitude: ");
    Serial.println(latitude, 6);

    Serial.print("Longitude: ");
    Serial.println(longitude, 6);

    Serial.println("Google Maps Location:");

    Serial.print("https://www.google.com/maps?q=");
    Serial.print(latitude, 6);
    Serial.print(",");
    Serial.println(longitude, 6);

    Serial.println();
    Serial.println("Preparing Emergency Alert...");
    Serial.println("Vehicle may require assistance.");
    Serial.println("Please contact the vehicle owner.");

    Serial.println("Emergency Alert Prepared!");
    Serial.println("********************************");
  }

  // 4. Buzzer Beep Pattern
  if (accidentDetected) {
    digitalWrite(BUZZER, HIGH);
    delay(300);

    digitalWrite(BUZZER, LOW);
    delay(300);
  } else {
    digitalWrite(BUZZER, LOW);
    delay(200);
  }
}
