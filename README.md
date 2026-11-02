# Forecast Sandbox

A browser recreation of the technique behind Uncanny's (Elliott Elder and George Muncey) visualiser for Oneohtrix Point Never's "D.I.S.". It is a falling-sand simulation where every grain is a pixel from a source image, and the pixel's colour decides how the grain behaves. A fictional forecasting program runs a schedule of disasters over it, then slowly loses its logic. This is an independent study. It is not affiliated with the artists or the label, and it ships none of their footage or archive imagery.

## Run it

Open `index.html` in a browser. It is plain JavaScript with no build step and no dependencies. If your browser blocks local file access, serve the folder instead:

```bash
python3 -m http.server 8000
```

Then open http://localhost:8000.

- **Load a song** (button, `M`, or drag and drop). The song becomes the forecast's timeline: phase changes snap to the track's section changes, and disasters fire on the hits in the matching frequency band (see "Audio" below). The waveform in the side panel shows progress and phase markers; click or drag it to seek, or use the arrow keys to skip 5 s.
- **Load images** (button, `I`, or drag and drop). Paintings and photos with strong greens, blues and reds work best. Each new scenario cycles through them. Without images, procedural "archive plates" are generated instead.

| Key | Action |
| --- | --- |
| `1` | Rain on/off |
| `2` | Wildfire (click to aim a lightning strike) |
| `3` | Earthquake |
| `4` | Eruption (click to place) |
| `5` | Meteor (click to aim) |
| `6` | Surge / tsunami |
| `7` | Vortex (click to place) |
| `8` | Overgrowth rule on/off |
| `9` | Degrade (glitch burst) |
| `0` | New plate |
| `A` | Autopilot on/off |
| `P` | Play/pause audio |
| `R` | Record the canvas and audio to a .webm file |
| `H` | Hide the interface |
| `Space` | Pause the simulation |

URL parameters: `?cell=5` sets the cell size in CSS pixels, `?density=0.7` sets the fraction of image pixels kept, `?speed=2` runs two simulation steps per frame, `?nointro` skips the intro screen, and `?phase=0.5` jumps the autopilot ahead (0 to 1).

## How it works

1. **Image to grid.** The source image is scaled into a grid of roughly 240 x 190 cells. Each cell is drawn as a square with a 1px dark seam. That seam is what makes the result read as "pixels" and not as a blurry picture.
2. **Colour to material** (`classify` in `src/sim.js`). Near-black becomes void. Hue then decides the material: green is flora, cyan and blue are water, saturated red is embers, brown and orange are earth, yellow is sand, and greys are stone, sand or earth depending on brightness. **Each cell keeps its original colour**, so the painting stays legible while it behaves like matter.
3. **Held cells.** Every image pixel starts out pinned in place. Pinned cells with nothing underneath let go at a small rate. That rate is what produces the slow, dripping, bottom-up crumbling and the vertical streaks. Earthquakes and audio onsets raise the release rate across the whole image.
4. **Cellular-automaton rules**, applied bottom-up with alternating scan direction:
   - Sand, earth, ash and fallen stone pile up.
   - Water falls and spreads sideways.
   - Fire rises, flickers, and ignites flora.
   - Lava flows slowly, sets things alight, and turns to stone when it touches water.
   - Smoke and steam rise, and steam near the top condenses back into rain.
   - Water feeds adjacent flora, so lakes slowly turn green.
5. **Overgrowth.** A late rule switch lets moss creep over every supported surface and convert stone and earth.
6. **Disasters.** These are short-lived forces layered on top of the rules:
   - Rain spawns water along the top edge.
   - Quakes shear rows sideways and release pinned cells.
   - Eruptions, meteor impacts, tsunamis and vortices throw cells as ballistic particles. Those particles re-enter the grid where they land.
7. **Director** (`src/director.js`). Ten phases run over the song: baseline, precipitation, wildfire, seismic, eruption, impact, surge, vortex, `????`, overgrowth. Bass onsets release cells and shake the ground. High frequencies drive the rain.
8. **Interface** (`src/overlay.js`). The interface has a dotted grid, live readouts, a typed log, and a "scenario consideration" panel with a diagram for each phase. As the forecast degrades, the readout labels are swapped character by character for devotional phrases, the numbers dissolve, and horizontal smear glitches tear the field.

## Audio

When a song loads it is decoded once. Its waveform is drawn in the panel. A three-band loudness envelope (below 200 Hz, 200 Hz to 3 kHz, above 3 kHz) is used to find section changes, and each scheduled phase boundary moves to the biggest change within about 6% of the song. That way, phases start when the music changes, including changes of sound at the same volume.

While it plays, the spectrum is split into five bands. Each band has a continuous level and its own hit detection. A hit is measured as the energy a band gains in one frame, relative to that band's usual energy. It is credited only to the band where it is strongest, so a hi-hat does not also count as a snare. Routing during autopilot:

| Signal | Continuous effect | Hits (in the phase that listens for them) |
| --- | --- | --- |
| SUB 30 to 90 Hz | ground tremor | every kick loosens the image; quakes in SEISMIC; collapse in SURGE |
| LOW 90 to 300 Hz | eruption strength | new eruptions in ERUPTION |
| MID 300 Hz to 2 kHz | fire spread (heat) | lightning in WILDFIRE |
| HIGH 2 to 6 kHz | rainfall | downpours in PRECIPITATION |
| AIR 6 to 14 kHz | wind | gusts that flip the wind |
| Loudness | vortex lift; in OVERGROWTH, quieter means faster growth | swells bring surges, drops bring meteors |
| Spectral flux | image tearing in the late phases | |

During the `????` phase every band triggers its own disaster. Without a song, phases run on a four-minute clock and fire events at random. The panel's signal routing meters show what each band is wired to at any moment.

Files: `src/sim.js` (simulation), `src/plates.js` (procedural source images), `src/audio.js`, `src/director.js`, `src/overlay.js`, `src/main.js` (rendering, input, recording).

See [docs/RESEARCH.md](docs/RESEARCH.md) for what is known about the original and what was inferred from frames.
