# Acceleration Monitor PCB (AMP)

**By: Cihad Khaled.** [KiCad Files](cihad/CihadKPCB-CihadKhaled.zip)

## Background 
The AMP tracks acceleration in the x, y, and z-axis in units of Earth's gravitational acceleration (g). 

## Design
The PCB is powered via a USB connection, which supplies both power and data communication to the computer. An MPU6050 tracks acceleration, which is read by an RP2040 microcontroller over an I²C interface. The computer receives this data and displays it in a console. A 1x2 connector allows the AMP to enter **BOOTSEL** mode when shorted. Additionally, a crystal oscillator provides a stable clock signal for timing operations.

The AMP was designed using KiCad:

### Schematics Design

![alt text](cihad/schi.png)  
**Figure 1.0**  

### PCB Design

![alt text](cihad/pcb.png)  
**Figure 1.1**  

### 3D Rendering of AMP

![alt text](cihad/3D.png)  
**Figure 1.2**  

## Hardware
All parts were bought and put together by [JLCPCB](https://jlcpcb.com/). **Table 2.0** has a list of all the components used in the AMP.  

![alt text](cihad/bom.png)  
**Table 2.0**  

## Physical PCB
The board arrived, and in **Figure 3.1**, the 1x2 connector is shorted using the red wire, thus in **BOOTSEL** mode.  

### AMP  
![alt text](cihad/AMP.jpg)  
**Figure 3.0**  

### BOOTSEL Mode  
![alt text](cihad/phys.png)  
**Figure 3.1**  

## Software
The software was programmed in **MicroPython** and uploaded to the RP2040's file system. The software configures the I²C interface by connecting the RP2040's GPIO28 and GPIO29 to the SDA and SCL of the MPU6050. The MPU6050 has a standardized address that the RP2040 communicates with to wake it up and start collecting acceleration data from the AMP.  

### Code uploaded onto the AMP  
![alt text](cihad/Code.png)  
**Figure 4.0**  

### Output
The code displays the data from the AMP onto the console, showing the x, y, and z components of the acceleration in units of g.  

### Stationary

When the AMP is placed stationary and upright, the z component represents the Earth's gravity on the AMP (~1g = 9.8 m/s²), while x and y are close to zero g. Shown in **Figure 4.1**, there is a slight discrepancy due to the AMP not being perfectly upright, causing Earth's gravity to also appear in the x and y components. Additionally, some noise is present in the readings.  

![alt text](cihad/Stationary.png)  
**Figure 4.1**  

### AMP says WOOF!

The AMP was getting antsy staying stationary, so it went on a walk in the negative y direction while slowly increasing speed, as shown in **Figure 4.2**.  

![alt text](cihad/walking.png)  
**Figure 4.2**  

### AMP goes up, up, up... and back down?

The AMP being thrown into the air was **simulated** (no broken PCB today!). The z-axis shows the acceleration of it going up and then coming back down, as shown in **Figure 4.3**.  

![alt text](cihad/thowingup.png)  
**Figure 4.3**  

### "Around we go"

The AMP was swung around in a circle, and the y-axis represents the **centripetal acceleration** of the PCB, as shown in **Figure 4.4**. The centripetal acceleration could be used to calculate the **tension** of the wire connecting the computer and the AMP.  

![alt text](cihad/Tension.png)  
**Figure 4.4**  

## Challenges 
The AMP project was a difficult PCB to make with zero experience. Understanding how each chip interacted with the others was challenging, and extracting relevant information from datasheets was a struggle in itself. Learning how to **read and interpret datasheets** is a skill I need to continue developing if I want to keep making PCBs.
