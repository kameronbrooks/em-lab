// The course playlist, in order. Video numbers used across the app are 1-based indexes into this list.

export const PLAYLIST_ID = 'PLwf7Ktk9he0MvmUQA4akVfiCovtk7_waZ';

export interface Video {
  n: number;
  id: string;
  duration: string;
  title: string;
}

const RAW = `B99is9Tz2r0|7:26|Electric force & electric field
3a52zAKsIOw|8:18|Electric field in the xy plane
Jyiccm1VXAw|10:28|Electric force from multi particle electric field
4PlPdNauHoA|6:04|Non zero electric force
z0Qk_ivL0y4|11:29|Direction of electric fields
RH4Iiuy7ESs|5:07|Electric field at specific point
wgRLbvFXdGQ|8:10|Electric field of two charged particles
lQI7HNTw0zg|13:53|Continuous distribution of charge - part 1
OmpFBx5hSUk|7:41|Continuous distribution of charge - part 2
dv3sPbf9cyA|13:57|Uniformly charged plane
G1hpi7l0ohI|6:46|Electric flux
mBxDg590ty4|7:43|Electric flux - 2
wOllPRJrOqA|10:09|Gauss' Law for electric fields
ep6jr8T-tv0|6:32|Gauss' Law to find the electric field - 1
ea9gJVPdlq0|9:15|Gauss' Law to find the electric field - 2
jB9ST5sDiOc|9:39|Gauss' Law to find the electric field - 3
bhQgD9lGMms|9:43|Electric flux for continuous charge distributions
r38v11YK88Y|4:57|Electric flux for continuous charge distributions - 2
bIoF8i6pKPc|6:14|Electric field of parallel charged plates
Lc6yXvo4xKM|7:27|Electric potential
FQa1NtxAxFU|8:48|Closed path integrals of E-field
PKZS_0z2urQ|5:38|E-field and loop integral of E-field
VsxiCQp8X3c|3:37|Electric potential and Work-Kinetic Energy theorem
3hoLkbme8ko|5:28|Electric potential and Work-Kinetic Energy theorem - 2
dGSIs91YBtc|6:02|Magnetic fields
h6VLSDOjRWI|6:29|Magnetic fields - 2
_qyXjFUYw2Q|4:08|Magnetic fields - 3
7ObdqIGxQJU|6:11|Work done by magnetic force
VCNssN_0zSM|8:11|The Biot-Savart Law
sfbcA7XOKl4|9:43|B-field of infinitely long current-carrying wire
X9OwT4vM2Qc|7:42|B-field of infinitely long current-carrying wire - 2
AUv6oBvK1_Y|8:35|Gauss' law for magnetic fields
_CzcXjYE75E|10:45|Curl and Divergence of electric and magnetic fields
0MYt9Nyn9vM|9:22|Ampere's law
fO_MkbDdb-o|9:22|Charged particle in a B-field
CCO2tLLqNIE|11:24|B-field of infinitely large plane of current
phedmHaSdWA|8:34|Magnetic flux from infinitely large plane of current
U-_j_IueKwU|12:03|B-field of solenoid
itbRfqIAOaI|4:47|Magnetic force near a solenoid
CLD-7NcvNAE|10:35|Magnetic force between two current wires
s6E9n_hyl1s|4:52|Ohm's Law
poyC9X_sodY|11:18|Induction
QYBD0HwXacs|7:00|Induced current
0EaIPTKFdCw|7:03|EMF
_W-u51VM77A|6:58|Disk induced current in solenoid
5MwQe4FXfzk|6:06|Loop moving into a B-field
ucc-1EMdlgo|6:28|Flux and emf from the long line of current
Ukl28IHXH-A|6:42|Induced current in loop pierced by solenoid of current
aCLuZVMTmKQ|4:59|Induced electric field
4ukSqIeCPMY|5:09|Maxwell equations
jd7O7u7djms|7:39|Resistive circuits in series
-C4rH46Y0lo|7:08|Resistive circuits in parallel
kz1DGrD_O_I|6:54|Resistive circuits
cK7FUorp640|5:48|Resistive circuits in series and in parallel
I9vlu0J56Hk|5:01|Resistive circuits in series and in parallel - 2
alNggf1P3Ks|6:45|Resistive circuits in series and in parallel - 3
15uyz7x7uvo|5:19|Power in a resistive circuit
TMhrftdW2t0|10:10|Electromagnetic force and time reversal
CNE0guOg8UU|6:43|Voltage across inductors and capacitors
qYZGnUIefxI|6:06|Capacitor and inductor energies
kgCsHO-W_Iw|7:28|Solving the LC circuit
ty_xLo6huHU|4:27|Energy in LC circuit
RVSlw1O6ep4|9:53|Current in LC circuit at some moment in time
coNisXDjjII|5:35|Peak current in LC circuit
RInle9958h0|4:27|Fractional energy in capacitor for LC circuit
wObaX38v8Ds|5:07|Fraction of maximum charge on capacitor
kLO7ZLrEmgY|2:37|Finding total energy in LC circuit
RKkQWl-XAgY|2:22|Max charge on capacitor in LC circuit
XjG4KdNVud4|4:30|A charged capacitor connected to an inductor
G4zE5wWbKx4|5:41|The RC circuit
2h3rehmZS5w|5:01|Energy in RC circuit
mfkGTd8hBw0|4:45|The RL circuit
gliuegeMw4E|11:20|The RLC circuit
MM5vE5UYkNM|4:49|Charge in an RLC circuit
iSCK6OTB55c|4:28|Critically damped RLC circuit
RhpJV5wlHdM|7:59|Phase and resonance in RLC circuit
vMrEuMYGWE8|8:16|Maxwell equations plus displacement current
xg0Xfpmg5bU|7:05|Maxwell equations in charge and current free regions
o3i0ur5HHC4|7:22|The wave equation
u4PqvDoKlMo|5:12|Wavelength, period, speed, of a 1D wave
sX0NuIS8D60|3:29|Direction of 1D wave propagation
8qb0ZXLwHzA|10:05|Electromagnetic waves
Ue8yD8lIK0E|5:52|Directions of E, B and wave
0jHNs0kNzoA|5:04|Amplitude of E and B for E&M wave`;

export const VIDEOS: Video[] = RAW.split('\n').map((line, i) => {
  const [id, duration, ...rest] = line.split('|');
  return { n: i + 1, id, duration, title: rest.join('|') };
});

export const videoUrl = (v: Video) => `https://www.youtube.com/watch?v=${v.id}&list=${PLAYLIST_ID}`;
export const getVideo = (n: number): Video | undefined => VIDEOS[n - 1];

/** Inclusive range helper: range(3, 6) -> [3, 4, 5, 6]. */
export const range = (a: number, b: number): number[] => Array.from({ length: b - a + 1 }, (_, i) => a + i);
