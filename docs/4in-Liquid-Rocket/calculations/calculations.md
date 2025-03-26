# Calculations

This page will cover how to size the thrust chamber for the Mojave Sphinx.

### How to Size the Throat?

1. Create an injector and target a specific discharge coefficient based on an expected pressure drop of approximately 20% of the feed pressure.
2. Characterize the injector’s discharge coefficient using a cold flow test, which involves measuring the mass flow rate.
3. Use the discharge coefficient along with a target chamber pressure to calculate the mass flow rate, then determine the throat size based on this value. Alternatively, you can start with a target mass flow rate, then compute the required chamber pressure and throat size.

## Oxidizer:Fuel Ratio 

Let's first determine what we want out O:F (Oxidizer:Fuel) ratio to be. This will allow us to set tank volume accordingly. We will calculate the stoichiometric ratio, then decide is we want to adjust it to something more oxidizer or fuel rich depending on our structural capabilities for our thrust chamber. 

### Molar Ratio

The following is a balanced reaction of pure $N_2O$ and Ethanol

$$
6 N_2O + C_2H_5OH \rightarrow 6 N_2 + 2 CO_2 + 3 H_2O
$$

As can be seen by the balanced equation, the molar ratio is 6:1. 

### Mass Ratio

To get mass ratio, use molecular weights: 

- $N_2O$: 44 g/mol
- $C_2H_5OH$: 46 g/mol. 

Mass ratio = $(6 \times 44) : (1 \times 46) = 264 : 46 \approx 5.74:1$.

### Volumetric Ratio

To get volumetric ratio, use molar ratio and liquid densities:

- $N_2O$: 6 moles, density = 1.22 g/cm³ (assume liquid state at 20°C), molar mass = 44 g/mol
- $C_2H_5OH$: 1 mole, density = 0.789 g/cm³, molar mass = 46 g/mol

Volume $N_2O$ = $\frac{6 \times 44}{1.22} = 216.39 \, \text{cm}^3$  

Volume $C_2H_5OH$ = $\frac{1 \times 46}{0.789} = 58.30 \, \text{cm}^3$  

Volumetric ratio = $216.39 : 58.30 \approx 3.71:1$

$$
\text{Volumetric ratio} = \frac{\frac{6 \times 44}{1.22}}{\frac{1 \times 46}{0.789}} \approx 3.71:1
$$

## Injector Characterization 

The pressure drop across the injector should be kept high enough that any abnormalities do not cause back flow. A recommended value if P_c is 60% of feed pressure. We however will size the injector such that the chamber pressure targets 250 PSI. For this rocket we don't want to deviate too much from the original design of the MS. We will however calculate the theoretical max chamber pressure.

## Theoretical Max Chamber Pressure

The max chamber pressure based off of the mechanical design will be calculated. Max axial and hoop stress will be calculated.

## Expansion Ratio

The chamber pressure is 250, area is x. choke area is x and expansion area is x~

[appendices](appendix.pdf)

## Scope

What are we looking for? 

We want the exit mach number to be as high as possible. This is will be achieved by matching the exit pressure as close to the atmospheric pressure as possible. It known that the chamber we have is tested at 250 PSI. Therefore, we need to know 

## Misc

There's a careful play between orifice sizing and initial fuel amount. You want to have about a 5:1 ox:fuel ratio by mass roughly.
[appendix](thrust-chamber-sizing/appendix.pdf)