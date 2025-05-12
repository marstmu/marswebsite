# Calculations for Mojave Sphinx Thrust Chamber Design

This page documents the methodology for sizing the thrust chamber of the Mojave Sphinx liquid rocket engine.

## Throat Sizing Procedure

1. Design an injector with a target discharge coefficient, aiming for a pressure drop of approximately 20% of the feed pressure
2. Determine the actual discharge coefficient through cold flow testing and mass flow rate measurements
3. Calculate the required throat size using either:
    - Known discharge coefficient and target chamber pressure → calculate mass flow rate → determine throat size
    - Target mass flow rate → compute required chamber pressure and throat size

## Propellant Ratio Analysis

### Oxidizer:Fuel (O:F) Ratio Determination

The O:F ratio directly influences tank volume requirements and combustion characteristics. We'll calculate the stoichiometric ratio and consider adjustments based on thrust chamber structural capabilities.

### Chemical Reaction Balance

Balanced reaction equation for N₂O (oxidizer) and Ethanol (fuel):

$$6 N_2O + C_2H_5OH \rightarrow 6 N_2 + 2 CO_2 + 3 H_2O$$

### Ratio Calculations

| Ratio Type | Calculation | Value |
|------------|-------------|-------|
| **Molar Ratio** | 6:1 (from balanced equation) | 6:1 |
| **Mass Ratio** | $(6 \times 44 \text{ g/mol}) : (1 \times 46 \text{ g/mol})$ | 5.74:1 |
| **Volumetric Ratio** | $\frac{\frac{6 \times 44}{1.22}}{\frac{1 \times 46}{0.789}}$ | 3.71:1 |

*Note: Densities used - N₂O: 1.22 g/cm³ (liquid at 20°C), Ethanol: 0.789 g/cm³*

## Injector Design Parameters

The injector is sized to achieve a target chamber pressure of 250 PSI, maintaining continuity with the original Mojave Sphinx design. Best practices suggest maintaining a pressure drop across the injector of approximately 40% of feed pressure to prevent flow anomalies and backflow.

## Structural Analysis

### Theoretical Maximum Chamber Pressure

The maximum allowable chamber pressure will be determined based on:

- Material yield strength
- Chamber wall thickness
- Safety factors
- Maximum axial and hoop stress calculations

## Nozzle Design

### Expansion Ratio Optimization

The expansion ratio will be calculated to achieve optimal performance at our operating conditions:

- Chamber pressure: 250 PSI
- Target exit pressure: atmospheric pressure
- Goal: Maximize exit Mach number while avoiding flow separation

## Performance Considerations

- The interplay between injector orifice sizing and propellant quantities must maintain the target 5.74:1 O:F ratio by mass
- Combustion efficiency and stability will be evaluated against this ratio
- Thermal management requirements will be assessed based on selected O:F ratio

[Isentropic Flow Tables](resources/appendix.pdf)
