# index

The ground station is a raspberry pi with an HC-12 connected to it running [this python code]:
[this python code]:https://github.com/zeulewan/groundstation/tree/main

``` py
import serial
import os
import csv

# Function to create a new file name
def create_new_file_name(directory, base_name):
    counter = 1
    while True:
        new_name = f"{base_name}{counter}.csv"
        full_path = os.path.join(directory, new_name)
        if not os.path.exists(full_path):
            return full_path
        counter += 1

# Create a new directory if it doesn't exist
directory = "data"
if not os.path.exists(directory):
    os.makedirs(directory)

# Open serial port
ser = serial.Serial('/dev/serial0', baudrate=9600)

# Generate a new file name
file_name = create_new_file_name(directory, "1")

# Open the CSV file for writing
with open(file_name, mode='w') as file:
    current_message = ""
    while True:
        data = ser.read().decode("utf-8", errors='ignore')
        if data == '\n':
            if current_message:
                # Write the message to the CSV file
                file.write(current_message + '\n')
                file.flush()
                current_message = ""
        else:
            current_message += data

```