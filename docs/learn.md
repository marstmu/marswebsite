# Learn

Brief intro to various skills.

## Embedded Systems

### Getting Started

Watch a video similar to [this](https://www.youtube.com/watch?v=aVUqaB0IMh4). Phil's Lab is great.

Set up:

- KiCad
- VSCode
- Markdown to document
- GitHub

### Design Process Example

This is a design process example. You'll have to iterate.

1. Set requirements, goals, and constraints. 
    - One of these constraints may be getting JLCPCB to do the assembly for you.
2. Select MCU, sensors, and peripherals. 
    - The RP2040 is generally recommended for its great documentation, ease of use, price, and flexibility. STM is harder to program, ESP does more but is more expensive.
    - The [BNO055](https://www.bosch-sensortec.com/products/smart-sensor-systems/bno055/) is great for a 9-axis IMU.
    - Check [JLCPCB](https://jlcpcb.com/parts) for part availability.
3. Select power management. 
    - You may need battery charger ICs, which exist in many forms; ask AI about it. You may just need to power from USB, in which case all you need is a buck converter or regulator.
4. Begin the schematic in KiCad.
    - Set up your BOM for assembly as soon as you start placing parts. Read the [JLCPCB assembly FAQ](https://jlcpcb.com/help/article/pcb-assembly-faqs).
5. Roughly place components in the PCB editor as you put things in the schematic to make sure you have enough space.
