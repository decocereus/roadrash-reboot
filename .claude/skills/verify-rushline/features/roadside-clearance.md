# Roadside clearance

The chase camera rides behind the bike and follows three quarters of its swing across the road, so a rider who runs wide carries the camera to the verge. A chevron, warning sign, marker post, pine, pole, boulder, gantry post or ramp beacon that comes within 2 m of the camera is gone for that moment, all of its parts together, and back once the camera has passed. Signs never show the outlines of a rider or post standing behind them.

## Sub-features

- `clear-sign` hides a roadside sign, its board and post together, while the camera passes it on the shoulder.
- `clear-tree` hides a whole pine, crown and trunk, when its crown reaches the camera though its trunk is further away.
- `clear-beacon` hides a ramp beacon's post and lamp while the camera crosses the lip, and shows them again behind the camera.
- `clear-restore` puts every hidden prop back as the camera leaves it, with no prop left missing.
- `clear-lane` leaves every prop in view in place while the rider stays a metre or more inside the road's edge.
- `sign-no-ghost` draws no outline of anything behind the back of a sign.

## How to get to it (user POV)

- Ride any road and run wide onto the shoulder past a sign, a pole or a tree.
- Crash into a roadside prop and watch the recovery camera behind the bike.
- Take any ramp and watch the lamp posts either side of its lip.
- Ride in the lane and look at the signs on both sides, front and back.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a development build (the flags below are DEV only).
- The outline check needs a `rv up --dev` slot, because it imports a file from `apps/web/test`.

- **Sign on the shoulder (`clear-sign`, `sign-no-ghost`).** Run `rv open --run <run> "/?ride=slag-row&at=1662&kmh=130&straight&clear&swerve=1662&swervefor=160&swerveto=1&hold=at&holdafter=1738&prof" --until race`, `rv wait --run <run> held --timeout 90`, `rv js --run <run> 'globalThis.__rushlineProfile.info().tick'`, `rv shot --run <run> slag-wide-1738`. The race freezes at tick 144 with the rider on the right shoulder at 1,738 m. The yellow chevron at 1,732 m is gone and the view past the bike is open. Before the fix the chevron's board covered the lower right of the frame with the rider's outline inked on it.
- **Tree behind a crash (`clear-tree`).** Run `rv open --run <run> "/?ride=ridge-road&at=650&kmh=130&straight&clear&swerve=650&swervefor=200&swerveto=1&hold=crash&holdafter=20&prof" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> ridge-crash-tree`. The race freezes at tick 118, twenty ticks after the crash, with the bike down on the right shoulder. No pine crown covers the view. Before the fix one filled the upper right of the frame.
- **Lane riding (`clear-lane`, `sign-no-ghost`).** Run `rv open --run <run> "/?ride=slag-row&at=1600&kmh=110&autopilot&clear&hold=at&holdafter=1712&prof" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> slag-lane-1712`. The chevrons on the right and the marker posts on both sides stand in their cel look with ink edges, and no board shows lines of anything behind it.
- **Ridden pass (`clear-restore`).** Run `rv open --run <run> "/?ride=slag-row&at=1662&kmh=130&straight&clear&swerve=1662&swervefor=160&swerveto=1&prof" --until race` and at once `rv screencast --run <run> slag-wide-ridden --seconds 8`. The rider runs onto the right shoulder. Each chevron and post goes as the camera reaches it and is back in the frames after the camera has passed. Then run `rv open --run <run> "/?ride=slag-row&at=1600&kmh=110&autopilot&clear&prof" --until race` and `rv screencast --run <run> slag-lane-ridden --seconds 8`. Riding in the lane, no prop disappears. Look at several frames of each, not just the first.
- **Ramp lip (`clear-beacon`).** Breakwater Run's first ramp has its toe at 4,050 m and its lip at 4,066 m. Run `rv open --run <run> "/?ride=breakwater-run&at=3700&autopilot&prof&hold=air&holdafter=8" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> ramp-lip`. Eight ticks into the air the camera is crossing the lip, and neither beacon's striped post nor its amber lamp is drawn. Run `rv js --run <run> 'globalThis.__rushlineRelease()'` and at once `rv screencast --run <run> ramp-lip-after --seconds 3`. Both beacons are back behind the bike once the camera has passed the lip.
- **Back of a sign (`sign-no-ghost`).** Run `rv js --run <run> 'import("/test/outline-sides.ts").then((m) => m.run())'` on a `--dev` slot. It renders a box behind an opaque double-sided board through the real post chain, once from the board's back and once from its front, and returns `ghosted: false` and `outlined: true`. `ghosted: true` means the outline pass drew the box through the board.

## Gotchas

- The flags skip the menus and force the steering with `swerve`, so they prove the camera and the scenery, not the pilot or a menu path.
- `hold=at` freezes at a distance and `hold=crash` a number of ticks after a crash; both fire once per page. Reopen the URL to try again.
- The clearance hides a prop by its whole parts and its full width, so a pine goes when its crown reaches the camera though its trunk is 4.6 m away. Check for the crown, not the trunk.
- `hold=air` counts ticks airborne. Much later than 8 ticks the camera is past the 2 m band and the beacons are drawn again behind it.
- On Hollow Pine Road and Ridge Road a rider within about half a metre of the road's edge brings a pine crown within 2 m of the camera, and it goes while still on screen. Further in, none does.
- Building fronts, banks, awnings, hanging signs and over-road cables do not take part. On the building line an awning can pass 1.8 m from the camera, but beside or behind it, never in front.
