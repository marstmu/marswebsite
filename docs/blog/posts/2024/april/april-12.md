---
title: Avionics Session on April 25th
date: 2024-04-12
comments: true
authors:
  - zeul
categories:
  - Info
---

We're going to have our major avionics tutorial on April 25th from 2-6pm at the DME.

**What you need for the session:**
  - Laptop
  - Your avionics kit

**What you should do before the session:**
  - [Solder your avionics](https://marstmu.com/Guidelines/Avionics-Guide/flight-computer/)
  - [Sign up for a GitHub account](https://github.com/)

We will be going over:

## Part 1
1. **Setting up flight computers**
    - Set voltage level
2. [Install Teensy software](https://www.pjrc.com/teensy/td_download.html)
3. **Programming boards**
    - Blink test
    - Download code from [GitHub](https://github.com/marstmu/flightcomputer) and load it onto the Arduino
4. **Record data from the SD card and check it on computers**
5. **Set antenna channels**
6. **Setting up ground stations**
    - Download [Raspberry Pi Imager](https://www.raspberrypi.com/software/)
      - Select RASPBERRY PI OS LITE (64-BIT)
      - Click the gear icon in the bottom right. Set hostname to your team name. Set password, and send it to your team's Discord chat on the Mars competition server. Enable SSH. Everything else is optional.
      - Plug in SD card, select it, click write.
    - Plug in Pis to network
    - **Mini Linux lesson:**
      - `ssh username@hostname`
      - `ls`, `ls -al`, `cd`, `mkdir`, `rm`, `rm -r`, `sudo`, permissions, users, groups
      - `git clone [ground station](https://github.com/marstmu/groundstation)`
      - Run `gs.py` with Python

## Part 2
1. **Committing to your team's documentation repo**

We'll have free pizza for everyone who is on a team and who clicked interested on the [Discord event](https://discord.gg/KNCHEXu3?event=1227018763862540392)!

## Notes for the leads
- Each team gets their own submodule on the website repo for their docs
- `ci.yml` needs to include updating to the latest commit for submodules
- Pizza for people
- Opportunity for teams to solder beforehand
- Solder surface mounted battery holders
- Need multimeters, screwdrivers
- Pis all need hostnames and a label on them
- Need UDR and both switches
- Dry run
- Adapter