# vimaan booking queue

vimaan is the one shared machine with a real GPU, so lanes take turns on it through one queue. A lane books a turn, waits for it from a background command that wakes it on its own, runs its jobs, and releases the turn. Anyone can read who holds vimaan, for what, since when, until when, and who waits. A lane with no booking cannot draw or measure there. A holder whose job died, who left the turn idle, or who ran far past its expected end loses the turn to the next lane.

## Sub-features

- vq-1: `rv book <lane> <minutes> <purpose>` books a turn and prints `BOOKING=<id>`. The first booking holds the turn at once, and the rest wait in order.
- vq-2: `rv book status` shows the holder with its purpose, turn start, expected end and whether it is idle or running a job. It then lists each waiter with an estimated start, followed by the last ended bookings and why each ended.
- vq-3: on vimaan (any machine named in `sharedMachines` in `packages/devtools/src/browser-host.ts`), `rv up`, `open`, `click`, `press`, `rebuild`, `rv bench`, `measure.ts` and `pnpm perf:gpu` need `RUSHLINE_BOOKING=<id>` naming the holder. Without one they exit 1 and print the `rv book` commands.
- vq-4: `pnpm vimaan wait <id>` blocks while the lane waits or its job runs, and exits 0 on its own when it is the lane's move. It retries a dropped link every 15 s for 20 tries.
- vq-5: `pnpm vimaan run <id> --cwd <dir> <label> -- <command>` runs the command on vimaan as the booking's job, in its own session, so a dropped link does not stop it. It prints the end of the job's log.
- vq-6: a job whose workload dies gives the turn back to its lane as idle. A job counts as running while `rv bench` or its command's process group lives, so a killed `rv bench` whose workload survives keeps the turn busy. A turn idle for more than 10 min passes to the next lane, and so does a turn that runs more than 15 min past its expected end.
- vq-7: every bench on a booking stops at the booking's expected end plus 15 min: SIGTERM to its child processes, SIGKILL 10 s later, and a non-zero exit.
- vq-8: on the Mac nothing needs a booking. `measure.ts` and `perf:gpu` fail at once while another bench holds the Mac, and `pnpm perf` queues behind it for up to an hour.

## How to get to it (user POV)

- A player never meets it. A lane meets it from the Mac through `pnpm vimaan status`, `book`, `wait`, `run` and `release`. On vimaan itself the same queue answers `rv book status`, `book`, `wait` and `release`.
- vimaan is for GPU work: frame-rate campaigns, `pnpm perf:gpu` and render captures. Multiplayer seats and kick or fight checks run on the Mac as two windows with `pnpm rooms:lag` or `pnpm rooms:fights`. vimaan joins a multiplayer check only for a final production pass, booked like any other job.
- Book, then run `pnpm vimaan wait <id>` as a background command. In Claude Code that is Bash with `run_in_background` and `timeout: 7200000`. A timeout or an exit 255 means the link dropped, so run it again. Run jobs with `pnpm vimaan run`, and release with `pnpm vimaan release <id>` when done.
- A T3 child on vimaan may do interactive work under the lane's booking, with `RUSHLINE_BOOKING=<id>` set for every `rv` call. The parent wakes from its own `pnpm vimaan wait <id> --end`, never from the child's completion.

## Driving it with rv

Preconditions: two lane threads on the Mac, here called A and B. Each has a checkout that `pnpm vimaan` can reach on vimaan, and `pnpm vimaan status` prints `free` or a holder. Lane A's checkout on vimaan is `~/wt/a`. Run every `rv` on vimaan with the same `TMPDIR`.

- **vq-3 no booking.** On vimaan, `rv up --path /kit` exits 1 and prints `This machine (linux-nvidia) is shared through the bench queue, so rv up needs a booking`, followed by the `rv book` commands. `rv list` and `rv book status` still work.
- **vq-1 and vq-2 two lanes.** A runs `pnpm vimaan book lane-a 20 frame campaign`, which prints `BOOKING=lane-a-<n>` and a `holder   lane-a-<n> holds it for frame campaign` line ending `idle since HH:MM`. B runs `pnpm vimaan book lane-b 15 intel capture` and sees `waiting  1. lane-b-<m> ... starts about HH:MM`, about A's expected end.
- **vq-4 a waiter wakes on its own.** B starts `pnpm vimaan wait lane-b-<m>` as a background command. It prints `number 1 in line` and keeps running. A runs `pnpm vimaan wait lane-a-<n>`, which exits 0 at once with `your turn`.
- **vq-5 a short job.** A runs `pnpm vimaan run lane-a-<n> --cwd ~/wt/a probe -- node -e "setTimeout(()=>{},20000)"`. While it runs, `pnpm vimaan status` shows `running probe (pid <pid>)`. B's wait is still running. After about 20 s A's command exits 0 and prints the log tail. A runs `pnpm vimaan release lane-a-<n>`, and within 15 s B's background wait exits 0 with `lane-b-<m>: your turn`. B releases.
- **vq-6 a job that dies.** A books again and starts `pnpm vimaan run <id> --cwd ~/wt/a probe -- node -e "setTimeout(()=>{},600000)"`. B books and waits. While the job runs, A starts its own `pnpm vimaan wait <id>` in the background. On vimaan, `kill -9 -- -<group>` with the `workload group` that `status` shows on the `running probe` line. A's run exits 137, and A's wait exits 0 with `probe ended; vimaan stays yours until HH:MM`. `status` shows A `idle since`, and B is still waiting. Either A releases, or 10 min later the next settle records `idle for more than 10 min`, and B's wait exits 0 with `your turn`.
- **vq-7 the deadline.** Book `lane-a 1 deadline check`, then `pnpm vimaan run <id> --cwd ~/wt/a deadline -- node -e "setTimeout(()=>{},3600000)"`. After 16 min the command exits non-zero, and the log tail has `deadline: stopped at HH:MM, because its booking ran out`. `status` lists the booking as `ran past its expected end HH:MM by more than 15 min`.
- **vq-8 the Mac.** `rv bench mac-campaign -- sleep 30` on the Mac. A second `rv bench other -- true` exits 1 and names `running mac-campaign`.

## Gotchas

- The queue lives in `$TMPDIR/rushline-verify/bench-queue.json`, guarded by `bench-queue.lock`. An agent with a different `TMPDIR` sees a different queue. Never edit the file by hand while anyone waits, because a file that does not decode reads as an empty queue.
- Only drawing commands and jobs keep a turn busy. `rv js`, `rv shot`, `rv sample` and `rv trace` do not reset the 10 min idle clock, so a turn that only reads for 10 min passes on.
- At the deadline a bench stops its command's process group, SIGTERM then SIGKILL. Work the command moved into a session of its own keeps running.
- A `rv book wait` without `--end` returns when the lane holds the turn and no job runs. A parent whose child holds the booking waits with `--end`.
- After a dropped link, `pnpm vimaan run` waits for the booking's job to end and exits 255, because the job's own code is not known. Read the log tail.
- Only machines named in `sharedMachines` require a booking. The Mac and CI runners book implicitly, so `pnpm perf` in CI needs none, and `pnpm test` on vimaan fails the `rv` CLI tests that draw unless they run under a booking.
