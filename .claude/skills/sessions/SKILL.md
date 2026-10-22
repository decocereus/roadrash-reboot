---
name: sessions
description: Find and read Rushline play-test sessions, the JSONL telemetry recordings in tools/perf/results/sessions. Use when investigating a tester report, slow frames, a black frame, a recorded fault, or whether a fix addresses a recorded problem. Read the session before reasoning from code, and account for every retained frame sample, suspect and fault.
---

# Sessions

A session is what one page load recorded: a batch every 30 seconds holding a frame-interval histogram, the period's slowest frames with their CPU time and draw calls per part, and events. It is not a video, an input replay or a browser trace. Start from what the browser recorded. Read source to interpret a finding only once you know the session and its build.

```text
session ID, report ID, device or build
  → find the file, snapshot it, confirm its identity
  → read the summary, every retained sample and the raw batches
  → give every frame sample, fault and suspect a disposition
  → state the coverage, what the recording cannot show, and the next observation
```

## Find

1. Read `docs/observability.md` and `docs/errors.md`. `packages/telemetry/src/schema.ts` and `limits.ts` define the format. `tools/perf/budgets.json` holds the frame budgets; link to it and do not copy its numbers. Its frame rows are judged by `pnpm perf:gpu`, which runs the benchmark races in two Helium windows on this Mac's GPU. A session is not that run, so it cannot pass or fail one of those limits. Say so rather than report a result.
2. Accept a full session UUID, a report ID, a device, a build or a directory. The default directory is `tools/perf/results/sessions/`. A report ID is the session's first eight characters, a dash and the batch number (`reportIdOf` in `limits.ts`).
3. Snapshot before you read. The collector may still be appending, and the reader loads every JSONL in `--dir` before it filters, so copy only the files you want into a new directory, make them read-only, and record the path, bytes, SHA-256 and time. Never move, repair or truncate an original.
4. Confirm the identity: the JSON holds exactly one session, its `sessionId` matches the filename, and you have its build SHA and dirty flag, device, renderer, pixel ratio, `startedAt` and received range. `--session` is a filename prefix filter, not an exact lookup.

```sh
source_dir=tools/perf/results/sessions
rg --files "$source_dir" -g '*.jsonl'
node tools/perf/session.ts --dir "$source_dir"
rg -l --fixed-strings "$report_id" "$source_dir" -g '*.jsonl'
session_dir=$(mktemp -d /tmp/rushline-session.XXXXXX)
scratch=$(mktemp -d /tmp/rushline-session-notes.XXXXXX)
cp "$source_dir/$session_id.jsonl" "$session_dir/"
chmod a-w "$session_dir"/*.jsonl
shasum -a 256 "$session_dir"/*.jsonl && wc -c "$session_dir"/*.jsonl && date -u +%FT%TZ
node tools/perf/session.ts --dir "$session_dir" --session "$session_id"
node tools/perf/session.ts --dir "$session_dir" --session "$session_id" --worst 9007199254740991 --json > "$scratch/session.json"
```

The text output lists ten frames, which is not enough for this loop. The `--json` run with a large `--worst` returns every retained sample; that number is a slice length, not a budget. `--worst` must be a number: `--worst all` prints an empty list and no error.

"No sessions in <dir>" does not prove nothing was recorded. The reader turns a directory it cannot list into an empty result and leaves out files with no valid batch. Check the path, file access, the snapshot, the `--session` prefix, the `--device` filter and whether the lines decode.

## Read

Each stored line is `{ batch, receivedAt }`. `receivedAt` is the collector's wall clock and `at` is milliseconds since the page started; they are different clocks. Cite evidence by file, physical line, `batchId`, and `frame` or event `seq`, plus race, tick and `at` where recorded. This lists every physical line and what it holds:

```sh
jq -R -c 'input_line_number as $line | (try fromjson catch null) as $o | {line: $line, batchId: $o.batch.batchId?, kind: $o.batch.kind?, receivedAt: $o.receivedAt?, parts: $o.batch.parts?, worst: [$o.batch.worst[]?.frame], events: [$o.batch.events[]? | {seq, kind, frame, at}]}' "$session_dir/$session_id.jsonl"
```

jq only parses JSON. The reader also decodes each line against the schema, so a line jq reads can still be unreadable to the reader. Join the summary to raw lines the way the reader does: the first valid line for a batch ID wins and later copies count as duplicate lines; batches are ordered by ID; a frame number or event `seq` found in more than one batch keeps the copy from the highest batch. A duplicate line is not a second observation. A batch listed as missing may still be on disk as an unreadable line.

Start with coverage: received and missing batches, duplicate and unreadable lines, the `dropped` counters, report IDs and markers, and the build. Then read together:

- Every `worst` entry: interval, `ticks`, `discardedMs`, race and tick, `cpu` and `calls`, `drawRung` and `nextRung`, pixel ratio, `drawnEpoch` and `sizeEpoch`.
- Every fault: source, message, `where`, frame, race and `seq`. A fault has no tick; do not borrow one from a nearby frame.
- Every suspect and the raw events behind it, and the governor, canvas, race, marker, visibility and overlay events.
- The histogram and the per-batch periods.

Name the `cpu` and `calls` indices from the `parts` array of the batch that holds the frame. The JSON summary leaves `parts` out, and the text output names the top four parts with the last batch's layout. An older recording can differ from today's `apps/web/src/profile-parts.ts`; read the batch, do not relabel from source.

## Explain

Write a short session header, then an evidence ledger. Every retained frame sample, fault and suspect gets a row or belongs to a group. A group lists every frame ID it covers and the evidence they share; "the rest look fine" is not coverage. Inspect every retained sample even when the question names one frame.

Each row ends in one of three outcomes:

- explained by recorded evidence;
- correlated with a recorded event, cause unresolved;
- not enough evidence.

An unresolved cause is a result, not permission to guess. Give the smallest next observation that could settle it. The review can be complete while the diagnosis is not.

## What a session cannot show

- Each batch keeps only its `MAX_WORST_FRAMES` slowest frames (`limits.ts`). Every frame counts in the histogram, but a frame without a retained sample has no detail and cannot be explained. Say how many histogram frames that leaves out.
- Missing batches, dropped batches, events and faults, unreadable lines and fault text clipped at `MAX_FAULT_TEXT` limit every claim. No recorded fault is not the same as no fault.
- There is no GPU timing, GC cause or browser scheduling trace. Do not get GPU time by subtracting CPU parts from an interval; the interval also holds the wait between frames.
- A sample whose profile frame was gone has `at` 0, empty `cpu` and `calls`, and zero rungs, epochs, race, tick and ticks (`worstFrameOf` in `apps/web/src/diagnostics/recorder.ts`). That is missing data, not a measured zero.
- The stall threshold, suspect scores, nearby-event windows and the "late" label in `tools/perf/src/session-summary.ts` are heuristics, not budgets and not proof of cause. A quality change beside a stall does not show what caused it.
- A dirty build cannot be rebuilt from its SHA. Source at that SHA shows where the build started, not what ran.

## Finish

End with the number of retained samples, faults and suspects reviewed; exactly what could not be reviewed; the supported findings; the unresolved causes; and the next useful observation. A fix is not verified because it compiles or because an unrelated fresh run looked fine. With a comparable later recording, compare provenance and the same evidence. Without one, say the fix is unverified against the recorded problem.

## Boundaries

This skill reads recordings. It does not change the game, the telemetry schema, the reader's output, the budgets or the uploader; delete sessions; change recording consent; send reports; start servers; or deploy.

For a fresh play test, sample or browser trace, use `.claude/skills/verify-rushline/SKILL.md` and its `features/frame-rate.md`: `rv sample`, `rv trace` and `rv console` under that skill's run rules. Never drive, reload, rebuild or stop ports 1350 or 1351 or the user's tunnel. A fresh trace can explain a reproduced problem; it is not a trace of the old session.

Do not edit source because a suspect ranks first. If the requested session is missing, say so; do not substitute a fixture. Never commit a session file, a full recording or a raw log as proof. Keep detailed evidence outside the repository and put only the findings and commands in a PR.
