# Ground Station


The ground station is a raspberry pi with an HC-12 connected to it running [this python code]:

[this python code]:https://github.com/marstmu/groundstation

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

## Raspberry Pi Antenna channel select:
![rpi](rpipinout.png)


 Using Minicom for writing a serial. Don't forget to set baud rate in [minicom] settings ($sudo minicom -s). Using the send message feature to send messages. ($^a s). Don't forget to change the serial port to serial0 in the minicom settings.

To communicate with the HC-12 make sure to set the “set” pin to low. Use the ASCII protocol to communicate with it. Write your commands in .txt files in the ~ directory. Find the commands in the datasheet.

[Following this guide.]: https://howtomechatronics.com/tutorials/arduino/arduino-and-hc-12-long-range-wireless-communication-module/

[minicom]:https://www.waveshare.com/wiki/Raspberry_Pi_Tutorial_Series:_Serial

To communicate with the HC-12 make sure to [set the “set” pin to low]. Use the ASCII protocol to communicate with it. Write your commands in .txt files in the ~ directory. Find the commands in the [datasheet].

[set the “set” pin to low]: https://embeddedcomputing.com/technology/processing/interface-io/quick-start-raspberry-pi-gpio-terminal-interface

[datasheet]: https://www.elecrow.com/download/HC-12.pdf

## Teensy Antenna channel select:

![teensypinout](teensypinout.png)

Connected the set pin to pin 2 on the teensy. Using [this guide], write the code.

[this guide]: https://howtomechatronics.com/tutorials/arduino/arduino-and-hc-12-long-range-wireless-communication-module/
