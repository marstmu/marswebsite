# Ground Station

The ground station is a raspberry pi with an HC-12 connected to it running [this python code]:

[this python code]:https://github.com/marstmu/groundstation

## Raspberry Pi Antenna channel select:
Connect the HC-12 to pins in the image below no need for the set pin, set the channel using the flight computer.
![Screenshot 2024-04-24 at 11 18 13 PM](https://github.com/marstmu/marswebsite/assets/55005377/e7b791ba-5f0e-448d-ab0e-44565b3c4eed)


## Teensy Antenna channel select:

![teensypinout](teensypinout.png)

Connected the set pin to pin 2 on the teensy. Using [this guide], write the code.

[this guide]: https://howtomechatronics.com/tutorials/arduino/arduino-and-hc-12-long-range-wireless-communication-module/
