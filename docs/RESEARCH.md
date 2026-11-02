# Research notes: "D.I.S." by Uncanny

## What the published sources say

From It's Nice That (11 Dec 2025) and Onepointfour (19 Jan 2026):

- Uncanny (Elliott Elder and George Muncey) built "a very real, bespoke software created for the purpose of this music video". Its input was sampled imagery from designer Julien Gobled's archive.
- "80 per cent of the video is made up of screen recordings" of the software running.
- The stated rules: "Red pixels are treated like fire, igniting the green pixels which represent grass. Blue pixels flow down, behaving like water, cultivating the growth of the grass."
- Late in production, sounds in the track "inspired the late addition of the ecosystem's overgrowth, reflected in a change to the code". The video ends with "the triumph of moss over devastated landscapes".
- "Modifier buttons were added to create synchronicity between the track and the landscapes to perform rainstorms and volcanic eruptions." In other words, disasters were performed live along with the music.
- The concept is a fictional environmental forecasting program, a "worst-case scenario machine" tracking values like wind speed and precipitation. It "gives up on objective prediction" and drifts toward belief.
- Uncanny's own site says their videos are "edited entirely generatively".

Neither source names a language, engine or tool. No source says whether it ran in a browser, Processing, TouchDesigner, Unity or something else. Anything below about implementation is inference.

## What the frames show

These observations come from the animated stills embedded in the It's Nice That article. The official video could not be downloaded from this environment.

- **Grid of tiles.** Each simulated pixel is drawn as a small square, about 4 to 5 screen pixels wide, with a visible dark seam between squares. Cells keep the source image's colours: muted greens, cyans, browns, greys, and very saturated red for fire.
- **The image crumbles from below.** Images sit on a floor line and disintegrate downward in thin vertical streaks, as single columns of cells detach and fall. That is the signature look, and it matches a "pinned pixel released when unsupported" rule.
- **Fire collects at the floor** as jagged red spikes along the bottom edge, which reads almost like a spectrum analyser. Isolated red cells drift up through the image.
- **Rain** appears as sparse blue cells scattered across the black above and around the image.
- **Sparse greys.** Grey and white regions are noticeably sparser than saturated ones. Those regions look like speckle and not solid fill.
- **Interface.** The interface is drawn on black:
  - a faint dot grid and tick marks down the left edge;
  - small serif or monospace caps text listing parameters in underscore_case, beside a second column of mystical phrases;
  - a boxed panel titled "SCENARIO CONSIDERATION 001" containing a labelled comet diagram (nucleus, coma, ion tail, dust tail);
  - a row of grey circles of decreasing size above a dashed line, with ASCII-character clouds below;
  - a pixel-font specimen ("abcdefg") being edited with red measurement guides, which suggests they drew a custom bitmap typeface.
- **Degradation.** There are full-frame horizontal smears where a strip of the image is stretched sideways, and moments of heavy horizontal tearing.

## How this repo maps onto that

| Observed or stated | Implementation here |
| --- | --- |
| Pixels from archive images | Image drawn into the grid. Every visible pixel becomes a cell that keeps its colour. |
| Red = fire, green = grass, blue = water | `classify()` maps hue to material, with additional materials for greys and browns. |
| Water cultivates grass | Water next to flora is converted into new flora. |
| Crumbling and vertical streaks | Cells start pinned, and unsupported pins release at a low rate. |
| Rainstorm and eruption buttons | Keys 1 to 9 and the on-screen buttons. Click to aim. |
| Late "overgrowth" code change | `sim.moss` rule switch, the final autopilot phase. |
| Forecast program losing its logic | The director's progress value drives label corruption, glitches and the log text. |
| Red spikes on the floor | The audio spectrum spawns short-lived fire cells along the bottom rows. |

The interface wording, diagrams, plates and phase schedule here are written for this project. They are not copied from the video.

## Sources

- It's Nice That: https://www.itsnicethat.com/articles/uncanny-elliott-elder-george-muncey-oneohtrix-point-never-animation-project-111225
- Onepointfour: https://www.onepointfour.co/2026/01/19/oneohtrix-point-never-d-i-s/
- Uncanny: https://uncanny.services/work
- Video: https://www.youtube.com/watch?v=CEeCziXT2FE
