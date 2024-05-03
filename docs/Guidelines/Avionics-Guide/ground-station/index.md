# Ground Station

The ground station is a raspberry pi with an HC-12.

Connect the HC-12 to pins in the image below no need for the set pin, set the channel using the flight computer.
![Screenshot 2024-04-24 at 11 18 13 PM](https://github.com/marstmu/marswebsite/assets/55005377/e7b791ba-5f0e-448d-ab0e-44565b3c4eed)

Enable the pins on the raspberry pi
`sudo raspi-config`
You should see this
<img width="900" alt="Screenshot 2024-04-24 at 11 32 10 PM" src="https://github.com/marstmu/marswebsite/assets/55005377/82de4186-5f41-4d2c-a7cc-cf23c46ca27b">
Select 3 Interface options
<img width="898" alt="Screenshot 2024-04-24 at 11 33 03 PM" src="https://github.com/marstmu/marswebsite/assets/55005377/bbdf033b-e07c-4af0-9068-86827cb2d6be">
select I5 Serial Port
<img width="660" alt="Screenshot 2024-04-24 at 11 33 38 PM" src="https://github.com/marstmu/marswebsite/assets/55005377/a9d5390f-11c8-433d-b8e8-596bc0db7872">
Select No dont enable ssh over serial
<img width="661" alt="Screenshot 2024-04-24 at 11 33 55 PM" src="https://github.com/marstmu/marswebsite/assets/55005377/14978f2e-614a-4205-8ea9-b6887c8d1939">
Select yes enable serial port hardware to be enabled


It should look like this
<img width="653" alt="Screenshot 2024-04-24 at 11 34 24 PM" src="https://github.com/marstmu/marswebsite/assets/55005377/8b52e4f7-4cfd-4c9e-970d-079b82f22de7">

Select finish, and reboot it now, you'll have to ssh into it again
<img width="903" alt="Screenshot 2024-04-24 at 11 34 49 PM" src="https://github.com/marstmu/marswebsite/assets/55005377/8f62ebfc-4b9c-4fb6-88fc-a2488e5b48b7">

- install git `sudo apt install git`
- clone repo `git clone https://github.com/marstmu/groundstation.git`
- install python library `sudo apt install python3-serial`
- Run gs.py with python `python gs.py`

If it says something like this: 
![ssh-remote-host-identification-has-changed](https://github.com/marstmu/marswebsite/assets/55005377/4a9797a5-6097-42b2-bb67-7d5683c53684)
Delete the known_hosts file your .ssh folder


