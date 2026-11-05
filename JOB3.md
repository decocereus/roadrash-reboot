# Job 3: look gap and same-size owner pictures on the UHD 630

Machine: vimaan, Intel UHD 630, fullscreen 1920x1080, device ratio 1. Stepped clock, one tick per frame. Pictures come from `Page.captureScreenshot` of the composited page, so the browser scales the canvas to the 1920x1080 page as in play. Every picture measures 1920x1080.

- `gap/`: landing `7fec2e9b`, nothing pinned, canvas 1344x756. PNGs were recompressed without changing a pixel.
- `owner/`: JPEG quality 90. Today is `e6eefae5` with `&rung=5` in the race, canvas 1536x864, 0 samples, no multisample buffer allocated. Landing is `7fec2e9b`, nothing pinned, canvas 1344x756. Bar: 1344x756 on both, nothing pinned.
- `job3-scripts/`: the capture generator, run scripts and `capture.log`, which holds a canvas and quality proof for every race still.

## One correction to today's race stills

At `e6eefae5`, opening a race with `&rung=5` leaves the chase camera at aspect 1 under the stepped clock. `applyDeviceStart` applies the size first, so the first `resize()` returns before `chase.resize`, and the picture is squeezed. Real play does not show this: an unpinned real-time `/?stress` run on the same build reached rung 5 at 1536x864 by tick 2144 with the normal framing.

The owner's today race pictures therefore come from a run that widened the canvas's CSS width to 1800 px and back at tick 1. That makes the game's own ResizeObserver call `chase.resize`. It changes no game code and no race state: canvas, rung and samples were re-proved at every still, and the frames line up with landing's.
