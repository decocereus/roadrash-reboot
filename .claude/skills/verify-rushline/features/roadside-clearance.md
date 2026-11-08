# Roadside clearance

The chase camera rides behind the bike and follows three quarters of its swing across the road, so a rider who runs wide carries the camera to the verge. A chevron, warning sign, marker post, pine, street tree, pole, boulder, gantry post, market stall or signal head that comes within 2 m of the camera is gone for that moment, all of its parts together, and back once the camera has passed. Signs never show the outlines of a rider or post standing behind them.

## Sub-features

- `clear-sign` hides a roadside board and its post together while the camera passes it on the shoulder: a chevron on every road, a warning sign on Ridge Road only.
- `clear-tree` hides a whole tree, crown and trunk (a pine on Ridge Road, a street tree on the city roads), when its crown reaches the camera though its trunk is further away.
- `clear-restore` puts every hidden prop back as the camera leaves it, with no prop left missing.
- `clear-lane` leaves every prop in view in place while the rider stays a metre or more inside the road's edge.
- `sign-no-ghost` draws no outline of anything behind the back of a sign.

## How to get to it (user POV)

- Ride any road and run wide onto the shoulder past a sign, a pole or a tree.
- Crash into a roadside prop and watch the recovery camera behind the bike.
- Ride in the lane and look at the signs on both sides, front and back.

## Driving it with rv

Preconditions:

- `rv doctor --run <run>` passes on a development build (the flags below are DEV only).
- The outline check needs a `rv up --dev` slot, because it imports a file from `apps/web/test`.

- **Sign on the shoulder (`clear-sign`, `sign-no-ghost`).** Run `rv open --run <run> "/?ride=slag-row&at=1662&kmh=130&straight&clear&swerve=1662&swervefor=160&swerveto=1&hold=at&holdafter=1712&prof" --until race`, `rv wait --run <run> held --timeout 90`, `rv js --run <run> 'globalThis.__rushlineProfile.info().tick'`, `rv shot --run <run> slag-wide-1712`. The race freezes with the rider on the right shoulder at 1,712 m. Slag Row's yellow chevrons stand every 12 m from 1,616 to 1,712 m and its poles every 30 m from 1,620 m, all on the right. The one beside the camera is gone and the view past the bike is open, with no board covering the lower right of the frame and no rider outline inked on one.
- **Tree behind a crash (`clear-tree`).** Run `rv open --run <run> "/?ride=ridge-road&at=650&kmh=130&straight&clear&swerve=650&swervefor=200&swerveto=1&hold=crash&holdafter=20&prof" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> ridge-crash-tree`. The race freezes at tick 118, twenty ticks after the crash, with the bike down on the right shoulder. No pine crown covers the view. Before the fix one filled the upper right of the frame.
- **Lane riding (`clear-lane`, `sign-no-ghost`).** Run `rv open --run <run> "/?ride=slag-row&at=1600&kmh=110&autopilot&clear&hold=at&holdafter=1712&prof" --until race`, `rv wait --run <run> held --timeout 90`, `rv shot --run <run> slag-lane-1712`. The chevrons and poles on the right stand in their cel look with ink edges, and no board shows lines of anything behind it.
- **Ridden pass (`clear-restore`).** Run `rv open --run <run> "/?ride=slag-row&at=1662&kmh=130&straight&clear&swerve=1662&swervefor=160&swerveto=1&prof" --until race` and at once `rv screencast --run <run> slag-wide-ridden --seconds 8`. The rider runs onto the right shoulder. Each chevron and pole goes as the camera reaches it and is back in the frames after the camera has passed. Then run `rv open --run <run> "/?ride=slag-row&at=1600&kmh=110&autopilot&clear&prof" --until race` and `rv screencast --run <run> slag-lane-ridden --seconds 8`. Riding in the lane, no prop disappears. Look at several frames of each, not just the first.
- **Back of a sign (`sign-no-ghost`).** Run `rv js --run <run> 'import("/test/outline-sides.ts").then((m) => m.run())'` on a `--dev` slot. It renders a box behind an opaque double-sided board through the real post chain, once from the board's back and once from its front, and returns `ghosted: false` and `outlined: true`. `ghosted: true` means the outline pass drew the box through the board.

## Gotchas

- The flags skip the menus and force the steering with `swerve`, so they prove the camera and the scenery, not the pilot or a menu path.
- `hold=at` freezes at a distance and `hold=crash` a number of ticks after a crash; both fire once per page. Reopen the URL to try again.
- Marker posts, warning signs, boulders and the pine treeline line Ridge Road only. Slag Row and Breakwater Run take their roadside from the city kit.
- The clearance hides a prop by its whole parts and its full width, so a pine goes when its crown reaches the camera though its trunk is 4.6 m away. Check for the crown, not the trunk.
- On Ridge Road a rider within about half a metre of the road's edge brings a pine crown within 2 m of the camera, and it goes while still on screen. Further in, none does.
- Building fronts, banks, awnings, hanging signs and over-road cables do not take part. On the building line an awning can pass 1.8 m from the camera, but beside or behind it, never in front.
