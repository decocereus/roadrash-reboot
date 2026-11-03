# Desktop session

On vimaan, the Linux laptop, no desktop runs until something needs one. `rv up` starts Hyprland on the real panel, opens the game in a Chromium window on the NVIDIA GPU, and the last slot to leave stops it again. A player sees the same game they see on the Mac, in a 1512x773 page at device pixel ratio 2.

## Sub-features

- ds-1: `rv up` starts the session and the browser from nothing.
- ds-2: two slots share one session, and it stops with the last of them.
- ds-3: a compositor someone else started is used and never stopped.
- ds-4: two agents starting at once get one session.
- ds-5: a seat that cannot open fails and says so.
- ds-6: the Intel host runs in the same session.
- ds-7: a session left behind by a killed `rv` is replaced or stopped.
- ds-8: a compositor with no X display fails at once and launches nothing.
- ds-9: `pnpm perf:gpu` refuses a page its rows were not measured on.

## How to get to it (user POV)

- A player never meets it. An agent meets it through `rv up`, `rv doctor`, `rv down` and `rv desktop up|down|status` on Linux. On the Mac `rv desktop` prints that the host needs none.

## Driving it with rv

Preconditions: Linux with the owner's console login on tty1, so logind can open `seat0`. `pgrep -x Hyprland` prints nothing, and `rv list` shows no run.

- **ds-1 from nothing.** `rv up --path "/?ride=slag-row&with=field&prof"` prints `RUN=<run>`. `rv doctor --run <run>` prints `ok   desktop session: Hyprland pid <pid> on :<n>` and `ok   gpu: ANGLE (NVIDIA Corporation, NVIDIA GeForce GTX 1650 Ti ...)`. `rv open --run <run> "/?ride=slag-row&with=field&prof" --until race`, then `rv press --run <run> ArrowUp --hold 6000`, moves the speed meter off 0. `rv shot --run <run> ride` shows the road, the rider and the HUD.
- **ds-2 two slots.** A second `rv up --path /kit` from the same machine reuses the pid, and `rv doctor` lists both runs as holders. The first `rv down` prints `desktop: left running for <other run>`. The second prints `desktop: stopped pid <pid>`. Then `pgrep -x Hyprland` prints nothing, ports 1410+n and 9410+n have no listener, and `$TMPDIR/rushline-verify` holds no `desktop.json`.
- **ds-3 someone else's compositor.** With a Hyprland you started yourself, `rv desktop status` prints `a compositor rv did not start is up`. `rv up` opens on its Xwayland display. `rv down` prints `desktop: left alone`, and your compositor keeps running.
- **ds-4 racing.** Three `rv desktop up` started together all print the same pid, and `pgrep -xc Hyprland` prints 1. `rv desktop down` stops it.
- **ds-5 no seat.** `LIBSEAT_BACKEND=seatd rv desktop up` exits 1 and prints `Hyprland exited before its session was ready, so it could not open the seat`, followed by the end of its log. Delete the crash report Hyprland writes under `~/.cache/hyprland`.
- **ds-6 Intel.** `RUSHLINE_BROWSER_HOST=linux-intel rv up --path /kit`, then `rv doctor --run <run>` prints `ok   gpu: ANGLE (Intel, Mesa Intel(R) UHD Graphics 630 ...)`, and `rv js --run <run> 'innerWidth + "x" + innerHeight + "@" + devicePixelRatio'` prints `1920x1080@1`. `rv list` shows `host linux-intel`. Run the same `rv up` again for a second run, then `RUSHLINE_BROWSER_HOST=linux-intel pnpm perf:gpu --a <run> --b <second run>` exits 2 and prints `linux-intel has no rows in tools/perf/budgets.json`. `rv down` both runs. Measure one Intel slot at a time: the second slot takes fullscreen from the first and changes its page to 1919x1079.
- **ds-7 orphan.** Start `rv desktop up`, and send it SIGKILL as soon as `pgrep -x Hyprland` prints a pid. `rv desktop status` prints `runs rv's config, but no claim matches it`, even once its Xwayland is up. `rv desktop down` prints `stopped pid <pid>`, and `pgrep -x Hyprland` prints nothing. Repeat the kill, and `rv desktop up` prints `owned session` with a new pid, and `pgrep -xc Hyprland` prints 1. `rv desktop down` stops it.
- **ds-8 no X display.** Start a Hyprland yourself with `xwayland { enabled = false }` in its config. `rv desktop status` prints `has no Xwayland, so rv cannot use it`. `rv desktop up` exits 1 within a second and prints `its config disables Xwayland`. `pgrep -xc Hyprland` still prints 1, `~/.cache/hyprland` holds no new crash report, and `rv desktop down` prints `left alone`. Stop your compositor by its pid.
- **ds-9 wrong page.** Start a Hyprland yourself with a config that does not float windows, then `rv up --path /kit` twice. `rv js` prints a page far smaller than 1512x773. `pnpm perf:gpu --a <run> --b <second run> --baseline-ref HEAD` exits 1 before warm-up and prints `A compositor rv did not start is the usual cause`, with both sizes. `rv down` both, and stop your compositor by its pid. In rv's own session the same command prints `display A` with `1512` and `773`, and later `gpu reference-v1 pair 0 A captured`.

## Gotchas

- `rv desktop up` holds the session until `rv desktop down`, so `rv down` leaves it running.
- A holder is alive while its browser's pid is. A crashed slot does not keep the session up once another holder leaves.
- `desktop.log` is deleted when the session stops. Read it before `rv down` if a session misbehaved.
- Behaviour after a reboot with no tty1 login is untested. It should fail as ds-5 does.
- rv's state lives in `$TMPDIR/rushline-verify`. An agent with a different `TMPDIR` cannot see the claim, so it reads a live session of rv's as an orphan and stops it on `rv desktop up` or `rv desktop down`. Run every `rv` on this machine with the same `TMPDIR`.
- `rv up` builds before it needs the desktop, so a compositor with no X display fails it after the build. `rv desktop up` fails at once.
