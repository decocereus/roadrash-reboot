--------------------------- MODULE RoomLifecycle ---------------------------
(***************************************************************************)
(* The life of a Rushline race room, checked together: the room host and  *)
(* its lobby on the Durable Object, the sockets the host holds, the race  *)
(* seats it holds for riders who drop, and each browser tab with its seat *)
(* and its door-moment handoff.                                           *)
(*                                                                         *)
(* Every action names the function it mirrors, as file:function, so a     *)
(* reviewer can hold the model against the code.  Files:                  *)
(*   host.ts         apps/rooms/src/host.ts                               *)
(*   host-phase.ts   apps/rooms/src/host-phase.ts                         *)
(*   socket-role.ts  apps/rooms/src/socket-role.ts                        *)
(*   race-seat.ts    apps/rooms/src/race-seat.ts                          *)
(*   race-build.ts   apps/rooms/src/race-build.ts                         *)
(*   room-config.ts  apps/rooms/src/room-config.ts                        *)
(*   lobby.ts        apps/rooms/src/lobby.ts                              *)
(*   race-server.ts  apps/rooms/src/race-server.ts                        *)
(*   seat-client.ts  apps/rooms/src/seat-client.ts                        *)
(*   room-lobby.tsx  apps/web/src/components/room-lobby.tsx               *)
(*   room-url.ts     apps/web/src/components/room-url.ts                  *)
(*   rejoin.tsx      apps/web/src/components/screens/rejoin.tsx           *)
(*   guest-name.ts   apps/web/src/components/guest-name.ts                *)
(*   room-handoff.ts apps/web/src/room-handoff.ts                         *)
(*   prepare.ts      apps/web/src/prepare-outcome.ts                      *)
(*                                                                         *)
(* Time moves in steps of about five seconds (Tick).  Everything a live   *)
(* link or a timer at zero must do happens before the next Tick, so a     *)
(* message on a working link always beats the next timer.  A player's     *)
(* own actions, a page load and a race preparation take any time.         *)
(*                                                                         *)
(* Each Guard constant is TRUE in the real code.  Setting one FALSE       *)
(* removes the behaviour that protects one rule, and TLC must then find   *)
(* a counterexample to that rule.                                         *)
(***************************************************************************)
EXTENDS Integers, Sequences, FiniteSets, TLC

CONSTANTS
    Riders,         \* browser tabs
    Twins,          \* TRUE: the tabs are one browser and share its member key (guest-name.ts memberKey, localStorage)
    Kind,           \* "custom" or "public" (room-id.ts roomKindOf)
    MostSeats,      \* MOST_SEATS (packages/sim/src/room.ts), lowered so a third tab meets "full"
    MaxRaces,       \* races the room may start in one behaviour
    Slots,          \* sockets one tab may have open or closing at once
    UserActs,       \* actions all players may take together, so a behaviour ends with them at rest
    StartDelay,     \* host.ts START_DELAY_MS 3 s
    Grace,          \* host.ts REPORT_GRACE_MS 5 s
    Quiet,          \* host.ts SILENT_SEAT_MS 10 s
    Deadline,       \* room-config.ts loadDeadlineSeconds, 20 s at launch
    Gather,         \* room-config.ts publicGatherSeconds, 10 s at launch
    Wait,           \* room-config.ts customStartSeconds 60 s and publicStartSeconds 45 s at launch
    Away,           \* room-config.ts awaySeconds, 120 s at launch
    Hold,           \* room-config.ts seatHoldSeconds, 30 s at launch and 5 s at least
    Door,           \* room-lobby.tsx DOOR_MOMENT_MS 5 s
    Reopen,         \* room-lobby.tsx REOPEN_MS 2 s
    ClientDead,     \* seat-client.ts DEAD_AFTER_MS 5 s
    OldPageFirst,   \* TRUE: the room hears a reloaded page's old sockets before its new seat (Reloaded)
    GuardRetireReplaced, GuardJoinByKey, GuardSweepWaits, GuardLeaveCode,
    GuardBootLeavesRoom, GuardFreeColour, GuardDropMarks, GuardDropRetires,
    GuardWaitForLoads, GuardSameRun, GuardReopen, GuardLateRoomRacing,
    GuardNeverArrived, GuardEndedBackToLobby, GuardDropHolds,
    GuardReplacedHolds, GuardRejoin, GuardRejoinCountdown, GuardTakenStaysPut,
    GuardHoldDeadline

VARIABLES
    room,   \* the host, its lobby, its race seats and the messages it has sent
    wire,   \* each socket as the browser sees it, and what it has sent
    tab     \* each tab: page, address, seat, handoff, door, game

vars == <<room, wire, tab>>

Sock == Riders \X (1..Slots)
Runs == 1..MaxRaces
SeatLive == {"connecting", "lobby", "loading", "racing"}
Outcomes == {"built", "missing"}
HostCloses == {"close1000", "close4408"}
Quits == {"quit4410", "quit4411"}

\* race-seat.ts SeatPresence: a seat still in the race is here or held
InRace == {"here", "held"}

CodeOf(m) ==
    CASE m = "close1000" -> 1000
      [] m = "close1001" -> 1001
      [] m = "close1006" -> 1006
      [] m = "close4408" -> 4408
      [] m = "close4410" -> 4410
      [] m = "quit4410" -> 4410
      [] m = "quit4411" -> 4411

Dec(x) == IF x > 0 THEN x - 1 ELSE x
Min(x, y) == IF x < y THEN x ELSE y

\* guest-name.ts memberKey: tabs of one browser share the key in localStorage
Lead == CHOOSE x \in Riders : TRUE
Key(r) == IF Twins THEN Lead ELSE r

(***************************************************************************)
(* The host and its lobby, as pure operators over the room record.  Lobby  *)
(* members and race seats are indexed by member key.                       *)
(***************************************************************************)

Send(R, s, m) ==
    IF R.broken[s] THEN R ELSE [R EXCEPT !.out[s] = Append(@, m)]

SendAll(R, ss, m) ==
    [R EXCEPT !.out = [s \in Sock |->
        IF s \in ss /\ ~R.broken[s] THEN Append(R.out[s], m) ELSE R.out[s]]]

Present(R) == {s \in Sock : R.sock[s] = "present"}
WithRole(R, x) == {s \in Present(R) : R.role[s] = x}
Members(R) == {k \in Riders : R.mem[k] # "none"}
Here(R) == {k \in Riders : R.mem[k] = "here"}

\* race-seat.ts stillLoading: a seat that is here and has not reported ready
StillLoading(R) == {k \in Riders : R.pres[k] = "here" /\ ~R.loaded[k]}

\* packages/sim/src/room.ts over: every seat left or done
Over(R) == \A k \in Riders : R.pres[k] \in InRace => R.done[k]

\* lobby.ts clockRuns
ClockRuns(R) ==
    IF Kind = "custom" THEN \E k \in Members(R) : R.ready[k] ELSE Here(R) # {}

\* lobby.ts settleClock: the clock starts once and keeps its start
SettleClock(R) ==
    [R EXCEPT !.clock =
        IF R.lPhase = "gathering" /\ ClockRuns(R)
        THEN (IF R.clock = -1 THEN 0 ELSE R.clock)
        ELSE -1]

AllReady(R) == \A k \in Members(R) : R.ready[k]
Earliest == IF Kind = "custom" THEN 0 ELSE Gather

\* lobby.ts due, with startsAt
Due(R) ==
    /\ R.lPhase = "gathering"
    /\ Here(R) # {}
    /\ R.clock # -1
    /\ R.clock >= (IF AllReady(R) THEN Earliest ELSE Wait)

\* lobby.ts leave
LeaveLobby(R, k) ==
    SettleClock([R EXCEPT !.mem[k] = "none", !.ready[k] = FALSE,
                          !.awayLeft[k] = 0, !.colour[k] = 0, !.arrived[k] = FALSE])

\* lobby.ts away: a member whose browser never reached the room is removed,
\* any other is held for awaySeconds
AwayFrom(R, k) ==
    IF R.mem[k] # "none" /\ ~R.arrived[k] /\ GuardNeverArrived
    THEN LeaveLobby([R EXCEPT !.freed[k] = TRUE], k)
    ELSE SettleClock([R EXCEPT
            !.mem[k] = IF @ = "none" THEN "none" ELSE "away",
            !.ready[k] = FALSE,
            !.awayLeft[k] = IF R.mem[k] = "none" THEN 0 ELSE Away])

\* host.ts message with lobby.ts arrive: the first packet from a seat shows
\* the browser reached the room
Arrive(R, s) ==
    IF R.sock[s] = "present" /\ R.mem[Key(s[1])] # "none"
    THEN [R EXCEPT !.arrived[Key(s[1])] = TRUE]
    ELSE R

UsedColours(R) == {R.colour[k] : k \in Members(R)}

\* lobby.ts freeColour; off, a colour counts members instead
FreeColour(R) ==
    IF GuardFreeColour
    THEN CHOOSE x \in 0..MostSeats :
            /\ x \notin UsedColours(R)
            /\ \A y \in 0..(x - 1) : y \in UsedColours(R)
    ELSE Cardinality(Members(R))

\* lobby.ts join; off, a returning key is not recognised and starts over.
\* inc flips when the lobby makes a new member, as a new member id.
Join(R, k) ==
    IF GuardJoinByKey /\ R.mem[k] # "none"
    THEN [ok |-> TRUE,
          room |-> SettleClock([R EXCEPT !.mem[k] = "here", !.awayLeft[k] = 0,
                                         !.freed[k] = FALSE])]
    ELSE LET R0 == IF R.mem[k] # "none"
                   THEN [R EXCEPT !.mem[k] = "none", !.ready[k] = FALSE]
                   ELSE R
         IN IF Cardinality(Members(R0)) >= MostSeats
            THEN [ok |-> FALSE, room |-> R]
            ELSE [ok |-> TRUE,
                  room |-> SettleClock([R0 EXCEPT
                      !.mem[k] = "here", !.ready[k] = FALSE, !.awayLeft[k] = 0,
                      !.colour[k] = FreeColour(R0), !.inc[k] = 1 - @,
                      !.freed[k] = FALSE, !.arrived[k] = FALSE])]

\* host.ts countDown: hostAfter loadingOver needs phase loading and the same run
CountDown(R, n) ==
    IF R.phase = "loading" /\ (R.run = n \/ ~GuardSameRun)
    THEN SendAll([R EXCEPT !.phase = "countdown", !.startLeft = StartDelay],
                 WithRole(R, "seated"), "countdown")
    ELSE R

\* host.ts countDownOnceLoaded
CountDownOnceLoaded(R) ==
    IF StillLoading(R) = {} \/ ~GuardWaitForLoads THEN CountDown(R, R.run) ELSE R

\* host.ts leaveRace: the seat leaves the race for good.  letGo is a ghost
\* that records whether the rider, or their game, chose to leave.
LeaveRace(R, k, chosen) ==
    IF R.pres[k] \notin InRace THEN R
    ELSE CountDownOnceLoaded([R EXCEPT !.pres[k] = "left", !.holdLeft[k] = -1,
                                       !.letGo[k] = chosen])

\* host.ts holdSeat: a seat that is here is held for the room config's
\* seatHoldSeconds, and a
\* held seat no longer holds up the countdown
HoldSeat(R, k) ==
    IF R.pres[k] # "here" THEN R
    ELSE CountDownOnceLoaded([R EXCEPT !.pres[k] = "held", !.holdLeft[k] = Hold])

\* host.ts partingOf: SEAT_LEFT 4410 and SEAT_QUIT 4411 leave the race and
\* any other close holds the seat; off, every close leaves it
Parting(code) ==
    IF code \in {4410, 4411} \/ ~GuardDropHolds THEN "leave" ELSE "hold"

\* host.ts retire, with holdSeat or leaveRace for a seated socket
Retire(R, s, parting, chosen) ==
    LET R1 == [R EXCEPT !.sock[s] = "gone", !.quiet[s] = -1]
    IN CASE R.role[s] # "seated" -> R1
         [] parting = "hold" -> HoldSeat(R1, Key(s[1]))
         [] OTHER -> LeaveRace(R1, Key(s[1]), chosen)

\* host.ts start with race-build.ts buildRace, and lobby.ts raceStarted:
\* every socket in the lobby gets a seat, which remembers its member
Start(R) ==
    LET g == WithRole(R, "lobby")
        seated == {Key(s[1]) : s \in g}
        n == R.run + 1
        R1 == [R EXCEPT
                !.lPhase = "racing",
                !.ready = [k \in Riders |-> FALSE],
                !.clock = -1,
                !.run = n,
                !.phase = "loading",
                !.pres = [k \in Riders |-> IF k \in seated THEN "here" ELSE "out"],
                !.seatInc = [k \in Riders |-> IF k \in seated THEN R.inc[k] ELSE 0],
                !.loaded = [k \in Riders |-> FALSE],
                !.done = [k \in Riders |-> FALSE],
                !.holdLeft = [k \in Riders |-> -1],
                !.letGo = [k \in Riders |-> FALSE],
                !.role = [s \in Sock |-> IF s \in g THEN "seated" ELSE R.role[s]],
                !.deadline[n] = Deadline,
                !.deadlineHit[n] = FALSE]
    IN SendAll(R1, g, "started")

\* host.ts consider
Consider(R) ==
    IF R.phase = "waiting" /\ R.run < MaxRaces /\ Due(R) THEN Start(R) ELSE R

\* host.ts drop: retire with partingOf, then lobby.leave for SEAT_LEFT 4410
\* or lobby.away
Drop(R, s, code) ==
    LET k == Key(s[1])
        R1 == IF GuardDropRetires
              THEN Retire(R, s, Parting(code), code \in {4410, 4411})
              ELSE [R EXCEPT !.quiet[s] = -1]
        R2 == IF ~GuardDropMarks THEN R1
              ELSE IF code = 4410 /\ GuardLeaveCode THEN LeaveLobby(R1, k)
              ELSE AwayFrom(R1, k)
        R3 == [R2 EXCEPT !.freed[k] = IF code = 4410 THEN TRUE ELSE @]
    IN Consider(R3)

\* host.ts end, with socket-role.ts raceOver and lobby.ts raceEnded; the
\* hold timers check state.run, so they lapse with the race
End(R) ==
    LET seated == WithRole(R, "seated")
        R1 == SendAll([R EXCEPT !.phase = "waiting"], seated, "ended")
    IN SettleClock([R1 EXCEPT
            !.role = [s \in Sock |-> IF s \in seated THEN "reporting" ELSE R1.role[s]],
            !.lPhase = "gathering",
            !.ready = [k \in Riders |-> FALSE],
            !.clock = -1,
            !.graces = @ \cup {Grace},
            !.pres = [k \in Riders |-> "out"],
            !.seatInc = [k \in Riders |-> 0],
            !.loaded = [k \in Riders |-> FALSE],
            !.done = [k \in Riders |-> FALSE],
            !.holdLeft = [k \in Riders |-> -1],
            !.letGo = [k \in Riders |-> FALSE]])

\* host.ts claimHold: the running race's seat for this member id, if it is
\* held and its hold has time left
HeldFor(R, k) ==
    /\ GuardRejoin
    /\ R.pres[k] = "held"
    /\ R.seatInc[k] = R.inc[k]
    /\ (R.holdLeft[k] > 0 \/ ~GuardHoldDeadline)

\* host.ts claimHold with holdRunsOut: a hold whose time ran out before its
\* timer woke leaves the race, as the timer would
ClaimLapsed(R, k) ==
    IF /\ GuardHoldDeadline
       /\ R.pres[k] = "held"
       /\ R.seatInc[k] = R.inc[k]
       /\ R.holdLeft[k] = 0
    THEN LeaveRace(R, k, FALSE)
    ELSE R

\* host.ts rejoin with socket-role.ts rejoined: the returning socket takes
\* the held seat and hears "started" with awayMs; while the race loads it
\* must report ready again, and once the countdown has begun it hears it
Rejoin(R, s, k) ==
    LET R1 == [R EXCEPT !.pres[k] = "here", !.holdLeft[k] = -1,
                        !.loaded[k] = IF R.phase = "loading" THEN FALSE ELSE @,
                        !.role[s] = "seated"]
        R2 == Send(R1, s, "back")
    IN IF R.phase \in {"countdown", "racing"} /\ GuardRejoinCountdown
       THEN Send(R2, s, "countdown")
       ELSE R2

\* host.ts seat: refuse "full", or join and retire this member's older
\* socket with a hold, let a hold that ran out go, then put a returning
\* rider back on a held seat, or let it go (leaveRace SEAT_QUIT) for a seat
\* opened with rejoin=no.
\* tellLobby reaches the socket only while it is in the lobby.  gaveUp is a
\* ghost: this tab's player chose Back to bar in the running race.
HostSeat(R, s, claim, gaveUp) ==
    LET k == Key(s[1])
        j == Join(R, k)
    IN IF ~j.ok
       THEN [Send(Send(R, s, "full"), s, "close1000") EXCEPT !.sock[s] = "gone"]
       ELSE LET old == {o \in Present(j.room) : Key(o[1]) = k /\ o # s}
                R1 == IF old = {} THEN j.room
                      ELSE LET o == CHOOSE o \in old : TRUE
                               R0 == Send(Send(j.room, o, "replaced"), o, "close1000")
                           IN IF GuardRetireReplaced
                              THEN Retire(R0, o, IF GuardReplacedHolds THEN "hold" ELSE "leave", FALSE)
                              ELSE R0
                R2 == ClaimLapsed([R1 EXCEPT !.sock[s] = "present",
                                             !.role[s] = "lobby",
                                             !.quiet[s] = -1], k)
                R3 == CASE HeldFor(R2, k) /\ claim -> Rejoin(R2, s, k)
                        [] HeldFor(R2, k) -> LeaveRace(R2, k, gaveUp)
                        [] OTHER -> R2
            IN IF R3.role[s] = "lobby" THEN Send(R3, s, "lobby") ELSE R3

\* host.ts message (hearLobby, hearRider, keepReport) and gone, via race-server.ts
HostOn(R, s, m, gaveUp) ==
    LET k == Key(s[1])
        H == Arrive(R, s)
    IN CASE m \in {"seat", "seatNo"} -> HostSeat(R, s, m = "seat", gaveUp)
         [] m = "ping" -> H
         [] m = "ready" ->
              IF R.sock[s] = "present" /\ R.role[s] \in {"lobby", "seated"}
              THEN Consider(IF H.lPhase = "gathering" /\ H.mem[k] # "none"
                            THEN SettleClock([H EXCEPT !.ready[k] = TRUE])
                            ELSE H)
              ELSE H
         [] m = "loaded" ->
              IF R.sock[s] = "present" /\ R.role[s] = "seated"
              THEN CountDownOnceLoaded([H EXCEPT !.loaded[k] = TRUE])
              ELSE H
         [] OTHER ->
              IF R.sock[s] = "present" THEN Drop(R, s, CodeOf(m)) ELSE R

(***************************************************************************)
(* The browser side.                                                       *)
(***************************************************************************)

\* seat-client.ts seatAfter and liveSeatAfter; "back" is "started" with awayMs
SeatNext(t, ev) ==
    IF t.seat \notin SeatLive THEN [ok |-> FALSE]
    ELSE CASE ev = "lobby" ->
                IF ~t.race THEN [ok |-> TRUE, seat |-> "lobby", race |-> FALSE]
                ELSE [ok |-> FALSE]
           [] ev \in {"started", "back"} ->
                IF ~t.race THEN [ok |-> TRUE, seat |-> "loading", race |-> TRUE]
                ELSE [ok |-> FALSE]
           [] ev = "countdown" ->
                IF t.seat = "loading" THEN [ok |-> TRUE, seat |-> "racing", race |-> t.race]
                ELSE [ok |-> FALSE]
           [] ev = "ended" ->
                IF t.seat = "racing" THEN [ok |-> TRUE, seat |-> "ended", race |-> t.race]
                ELSE [ok |-> FALSE]
           [] ev \in {"full", "replaced"} ->
                IF ~t.race THEN [ok |-> TRUE, seat |-> "refused", race |-> FALSE]
                ELSE [ok |-> TRUE, seat |-> "lost", race |-> TRUE]
           [] ev \in {"closed", "silent"} ->
                [ok |-> TRUE, seat |-> "lost", race |-> t.race]
           [] ev = "left" ->
                [ok |-> TRUE, seat |-> "left", race |-> t.race]

\* room-lobby.tsx SeatedLobby onChange through room-handoff.ts seatChange.
\* A seat lost to another tab moves to rejoin=taken (seatTaken).  A lost
\* lobby seat reopens after REOPEN_MS (reopen).  A lost race seat shows
\* SignalLost while riding (raceLost), and otherwise moves with rejoin=try
\* (tryRejoin).  A seat whose race ended before its tab rode moves back to
\* the room (backToLobby).  The address "try" also stands for no choice,
\* since both ask for a held bike.
OnChange(t, taken) ==
    LET t1 == IF t.seat = "racing" /\ ~GuardLateRoomRacing
              THEN [t EXCEPT !.fresh = TRUE] ELSE t
    IN CASE t1.seat = "lost" /\ taken /\ GuardTakenStaysPut ->
              [t1 EXCEPT !.page = "reloading", !.url = "taken"]
         [] t1.seat = "lost" /\ ~t1.race ->
              IF GuardReopen THEN [t1 EXCEPT !.reopen = Reopen] ELSE t1
         [] t1.seat = "lost" /\ t1.handoff = "riding" ->
              [t1 EXCEPT !.page = "lost"]
         [] t1.seat = "lost" ->
              [t1 EXCEPT !.page = "reloading", !.url = "try"]
         [] t1.seat = "ended" /\ t1.handoff # "riding" /\ GuardEndedBackToLobby ->
              [t1 EXCEPT !.page = "reloading", !.url = "try"]
         [] OTHER -> t1

\* seat-client.ts hangUp: close() on an open socket sends its code; on a
\* socket still connecting the browser fails the connection, so the room
\* hears an abnormal close
CloseFrom(W, s, m) ==
    CASE W.cs[s] = "open" ->
           [W EXCEPT !.cs[s] = "closed",
                     !.toH[s] = IF room.broken[s] THEN @ ELSE Append(@, m)]
      [] W.cs[s] = "connecting" ->
           [W EXCEPT !.cs[s] = "closed",
                     !.toH[s] = IF room.broken[s] THEN @ ELSE Append(@, "close1006")]
      [] OTHER -> W

\* seat-client.ts loaded: the ready packet, sent only on an open socket
ReportLoaded(W, s) ==
    IF W.cs[s] = "open" /\ ~room.broken[s]
    THEN [W EXCEPT !.toH[s] = Append(@, "loaded")]
    ELSE W

CurOf(r) == <<r, tab[r].cur>>

\* room-lobby.tsx doorMoment: seat && raceBegun && ready
DoorMoment(r) ==
    /\ tab[r].page = "room"
    /\ tab[r].seat \in {"loading", "racing"}
    /\ tab[r].game = "ready"

\* room-lobby.tsx roomRacing effect: the room races and this tab is ready for it
WaitingForRace(r) ==
    /\ tab[r].page = "room"
    /\ tab[r].handoff = "waitingForRoom"
    /\ tab[r].seat = "racing"

FreeSlots(r) == {i \in 1..Slots : wire.cs[<<r, i>>] = "free"}

\* the room has heard everything this tab sent on a working link
Delivered(r) == \A i \in 1..Slots : wire.toH[<<r, i>>] = <<>>

\* seat-client.ts openRoomSeat, called by room-lobby.tsx SeatedLobby with
\* rejoin unless the address says rejoin=no (seatUrl)
OpenSeat(r, i, t) ==
    /\ wire' = [wire EXCEPT !.cs[<<r, i>>] = "connecting",
                            !.toH[<<r, i>>] = <<IF t.url = "no" THEN "seatNo" ELSE "seat">>,
                            !.dead[<<r, i>>] = -1,
                            !.pinged[<<r, i>>] = FALSE,
                            !.quitHeard[<<r, i>>] = FALSE]
    /\ tab' = [tab EXCEPT ![r] = [t EXCEPT !.cur = i, !.seat = "connecting",
                                           !.race = FALSE, !.back = FALSE,
                                           !.reopen = -1]]

\* the actions all players have taken so far
ActsUsed ==
    LET Sum[S \in SUBSET Riders] ==
            IF S = {} THEN 0
            ELSE LET x == CHOOSE x \in S : TRUE IN tab[x].acts + Sum[S \ {x}]
    IN Sum[Riders]

Acting(r) == ActsUsed < UserActs
\* told is a ghost: this tab heard that another tab of its browser took its
\* race seat, and its player has not acted since
Act(t) == [t EXCEPT !.acts = @ + 1, !.told = FALSE]

(***************************************************************************)
(* Host actions.                                                           *)
(***************************************************************************)

\* race-server.ts webSocketMessage, webSocketClose, and the seat upgrade.
\* quitHeard records that the room took a deliberate close on a seat it held.
\* The upgrade's join gate (gate.ts) is left out.  It refuses "limited" only
\* while nobody is present and before the host hears the seat, and the seat
\* client reads any refusal on a fresh socket as "refused", like "full".
HostRecv(s) ==
    /\ wire.toH[s] # <<>>
    /\ LET m == Head(wire.toH[s])
       IN /\ room' = HostOn(room, s, m, tab[s[1]].gaveUp = room.run)
          /\ wire' = [wire EXCEPT !.toH[s] = Tail(@),
                                  !.quitHeard[s] = @ \/ (m \in Quits /\ room.sock[s] = "present")]
    /\ UNCHANGED tab

\* host.ts start's loadDeadlineSeconds timer: countDown(run)
HostDeadline(n) ==
    /\ room.deadline[n] = 0
    /\ room' = CountDown([room EXCEPT !.deadline[n] = -1, !.deadlineHit[n] = TRUE], n)
    /\ UNCHANGED <<wire, tab>>

\* host.ts countDown's START_DELAY_MS timer: hostAfter startMoment
HostStartMoment ==
    /\ room.startLeft = 0
    /\ room' = [room EXCEPT !.startLeft = -1,
                            !.phase = IF @ = "countdown" THEN "racing" ELSE @]
    /\ UNCHANGED <<wire, tab>>

\* host.ts ride: room.over() after a step ends the race
HostEnd ==
    /\ room.phase = "racing"
    /\ Over(room)
    /\ room' = End(room)
    /\ UNCHANGED <<wire, tab>>

\* a seat finishes, or the six-minute limit hands it to the pilot; a held
\* bike keeps rolling with the pilot (rejoin.tsx SignalLost)
RiderDone(k) ==
    /\ room.phase = "racing"
    /\ room.pres[k] \in InRace
    /\ ~room.done[k]
    /\ room' = [room EXCEPT !.done[k] = TRUE]
    /\ UNCHANGED <<wire, tab>>

\* host.ts holdSeat's seatHoldSeconds timer (room-config.ts): a seat still
\* held leaves the race
HostHoldOver(k) ==
    /\ room.pres[k] = "held"
    /\ room.holdLeft[k] = 0
    /\ room' = LeaveRace(room, k, FALSE)
    /\ UNCHANGED <<wire, tab>>

\* host.ts end's REPORT_GRACE_MS timer: reporting sockets go back to the
\* lobby role and the host closes them
HostGrace ==
    /\ 0 \in room.graces
    /\ LET rep == WithRole(room, "reporting")
       IN room' = [SendAll(room, rep, "close1000") EXCEPT
                     !.graces = @ \ {0},
                     !.role = [s \in Sock |-> IF s \in rep THEN "lobby" ELSE room.role[s]]]
    /\ UNCHANGED <<wire, tab>>

\* host.ts watchSeats: a seat silent for SILENT_SEAT_MS is closed with 4408 and dropped
HostQuiet(s) ==
    /\ room.sock[s] = "present"
    /\ room.quiet[s] = 0
    /\ room' = Drop(Send(room, s, "close4408"), s, 4408)
    /\ UNCHANGED <<wire, tab>>

\* host.ts watchSeats with lobby.ts sweep: an away member past awaySeconds
\* is removed
HostSweep(k) ==
    /\ room.mem[k] = "away"
    /\ room.awayLeft[k] = 0 \/ ~GuardSweepWaits
    /\ room' = [room EXCEPT !.mem[k] = "none", !.ready[k] = FALSE,
                            !.awayLeft[k] = 0, !.colour[k] = 0, !.arrived[k] = FALSE]
    /\ UNCHANGED <<wire, tab>>

\* host.ts watchSeats: consider() once a second
HostConsider ==
    /\ room.phase = "waiting"
    /\ room.run < MaxRaces
    /\ Due(room)
    /\ room' = Start(room)
    /\ UNCHANGED <<wire, tab>>

(***************************************************************************)
(* Browser actions the code takes by itself.                               *)
(***************************************************************************)

\* the WebSocket open event, once the room took the upgrade, and with it the
\* seat's rejoin choice; room-lobby.tsx onOpen then takes rejoin=no out of
\* the address (room-url.ts clearRejoinNo), so later seats rejoin
ClientOpened(s) ==
    /\ wire.cs[s] = "connecting"
    /\ room.sock[s] # "none"
    /\ wire' = [wire EXCEPT !.cs[s] = "open"]
    /\ tab' = IF tab[s[1]].cur = s[2]
              THEN [tab EXCEPT ![s[1]].url = IF @ = "no" THEN "try" ELSE @]
              ELSE tab
    /\ UNCHANGED room

\* seat-client.ts message and close listeners, move, enter (hangUp on
\* ended and refused), then room-lobby.tsx onChange
ClientRecv(s) ==
    /\ wire.cs[s] = "open"
    /\ room.out[s] # <<>>
    /\ LET r == s[1]
           m == Head(room.out[s])
           t == tab[r]
           live == t.cur = s[2] /\ t.page \in {"room", "race"}
           isClose == m \in HostCloses
           ev == IF isClose THEN "closed" ELSE m
           nx == SeatNext(t, ev)
           moved == live /\ nx.ok
           W1 == [wire EXCEPT
                    !.cs[s] = IF isClose THEN "closed" ELSE @,
                    !.toH[s] = IF isClose /\ ~room.broken[s] THEN Append(@, m) ELSE @]
           W2 == IF moved /\ ev \in {"ended", "full", "replaced"}
                 THEN CloseFrom(W1, s, "close1000") ELSE W1
       IN /\ room' = [room EXCEPT !.out[s] = Tail(@)]
          /\ wire' = W2
          /\ tab' = IF moved
                    THEN [tab EXCEPT ![r] =
                            OnChange([t EXCEPT !.seat = nx.seat, !.race = nx.race,
                                               !.back = @ \/ ev = "back",
                                               !.told = @ \/ (ev = "replaced" /\ nx.race)],
                                     ev = "replaced")]
                    ELSE tab

\* seat-client.ts open listener: the first sendPing, PING_EVERY_MS after open
ClientPing(s) ==
    /\ wire.cs[s] = "open"
    /\ ~wire.pinged[s]
    /\ wire' = [wire EXCEPT !.pinged[s] = TRUE,
                            !.toH[s] = IF room.broken[s] THEN @ ELSE Append(@, "ping")]
    /\ UNCHANGED <<room, tab>>

\* a message to a socket the browser already closed is dropped
ClientDiscard(s) ==
    /\ wire.cs[s] = "closed"
    /\ room.out[s] # <<>>
    /\ room' = [room EXCEPT !.out[s] = Tail(@)]
    /\ UNCHANGED <<wire, tab>>

\* seat-client.ts sendPing: unanswered pings for DEAD_AFTER_MS make the seat
\* silent; a connection that never opened fails with a close event
ClientDeadFire(s) ==
    /\ wire.dead[s] = 0
    /\ LET r == s[1]
           t == tab[r]
           live == t.cur = s[2] /\ t.page \in {"room", "race"}
                   /\ wire.cs[s] \in {"connecting", "open"}
           nx == SeatNext(t, IF wire.cs[s] = "open" THEN "silent" ELSE "closed")
       IN /\ wire' = [wire EXCEPT !.dead[s] = -1,
                                  !.cs[s] = IF @ \in {"connecting", "open"} THEN "closed" ELSE @]
          /\ tab' = IF live /\ nx.ok
                    THEN [tab EXCEPT ![r] = OnChange([t EXCEPT !.seat = nx.seat,
                                                               !.race = nx.race], FALSE)]
                    ELSE tab
          /\ UNCHANGED room

\* a socket both sides are done with frees its slot for the tab's next one
Reusable(s) ==
    /\ wire.cs[s] = "closed"
    /\ room.sock[s] # "present"
    /\ wire.toH[s] = <<>>
    /\ room.out[s] = <<>>
    /\ wire.dead[s] = -1

Reuse(s) ==
    /\ Reusable(s)
    /\ wire' = [wire EXCEPT !.cs[s] = "free"]
    /\ room' = [room EXCEPT !.sock[s] = "none", !.role[s] = "lobby",
                            !.broken[s] = FALSE, !.quiet[s] = -1]
    /\ UNCHANGED tab

\* room-lobby.tsx door-moment effect starts doorWaitOf: DOOR_MOMENT_MS, or
\* none for a rider getting back on (awayMs)
DoorArm(r) ==
    /\ DoorMoment(r)
    /\ tab[r].door = -1
    /\ tab' = [tab EXCEPT ![r].door = IF tab[r].back THEN 0 ELSE Door]
    /\ UNCHANGED <<room, wire>>

\* room-lobby.tsx door-moment effect cleanup clears the timer
DoorDisarm(r) ==
    /\ ~DoorMoment(r)
    /\ tab[r].door # -1
    /\ tab' = [tab EXCEPT ![r].door = -1]
    /\ UNCHANGED <<room, wire>>

\* room-lobby.tsx raceBegun effect, room-handoff.ts stepRoom: lobby to
\* preparing with the prepare effect
RaceBegun(r) ==
    /\ DoorMoment(r)
    /\ tab[r].handoff = "lobby"
    /\ ~tab[r].prep
    /\ tab' = [tab EXCEPT ![r].handoff = "preparing", ![r].prep = TRUE]
    /\ UNCHANGED <<room, wire>>

\* room-handoff.ts roomRows doorElapsed: atDoor reports loaded, preparing
\* waits past the door
DoorElapsed(r) ==
    /\ tab[r].door = 0
    /\ LET t == tab[r]
           h == t.handoff
       IN /\ tab' = [tab EXCEPT ![r].door = -2,
                                ![r].handoff = CASE h = "atDoor" -> "waitingForRoom"
                                                 [] h = "preparing" -> "preparingPastDoor"
                                                 [] OTHER -> h]
          /\ wire' = IF h = "atDoor" THEN ReportLoaded(wire, CurOf(r)) ELSE wire
          /\ UNCHANGED room

\* prepare-outcome.ts preparedRace and room-handoff.ts roomRows: built goes
\* on; missing (a failed dress or build) runs the leave effect, seat-client.ts
\* leave (SEAT_QUIT 4411) and moveToRoom.  A lost graphics context resolves
\* as built.  The effect runs even after SeatedLobby unmounted, as long as
\* the page lives.
PrepareDone(r, o) ==
    /\ tab[r].prep
    /\ tab[r].page \notin {"reloading", "gone"}
    /\ LET t == tab[r]
           h == t.handoff
           s == CurOf(r)
           leaving == o = "missing" /\ h \in {"preparing", "preparingPastDoor"}
           nx == SeatNext(t, "left")
       IN /\ tab' = [tab EXCEPT ![r] =
                       [t EXCEPT
                          !.prep = FALSE,
                          !.handoff = CASE o = "built" /\ h = "preparing" -> "atDoor"
                                        [] o = "built" /\ h = "preparingPastDoor" -> "waitingForRoom"
                                        [] leaving -> "left"
                                        [] OTHER -> h,
                          !.seat = IF leaving /\ nx.ok THEN "left" ELSE @,
                          !.page = IF leaving THEN "reloading" ELSE @,
                          !.url = IF leaving THEN "try" ELSE @]]
          /\ wire' = CASE o = "built" /\ h = "preparingPastDoor" -> ReportLoaded(wire, s)
                       [] leaving /\ nx.ok -> CloseFrom(wire, s, "quit4411")
                       [] OTHER -> wire
          /\ UNCHANGED room

\* room-lobby.tsx roomRacing effect, deps [handoff, racing]: waitingForRoom
\* to riding, and onStart shows the race
RoomRacing(r) ==
    /\ WaitingForRace(r)
    /\ GuardLateRoomRacing \/ tab[r].fresh
    /\ tab' = [tab EXCEPT ![r].handoff = "riding", ![r].page = "race",
                          ![r].door = -1, ![r].fresh = FALSE]
    /\ UNCHANGED <<room, wire>>

\* with the roomRacing effect keyed on racing alone, it runs once when the
\* seat starts racing and does nothing if the handoff is not yet waiting
RacingSeen(r) ==
    /\ tab[r].fresh
    /\ ~WaitingForRace(r)
    /\ tab' = [tab EXCEPT ![r].fresh = FALSE]
    /\ UNCHANGED <<room, wire>>

\* room-lobby.tsx REOPEN_MS timer: a new seat in the same SeatedLobby
Reopened(r) ==
    /\ tab[r].reopen = 0
    /\ tab[r].page = "room"
    /\ \E i \in FreeSlots(r) : OpenSeat(r, i, tab[r])
    /\ UNCHANGED room

\* room-lobby.tsx raceLost polls the room with readRoomPreview while
\* rejoin.tsx SignalLost shows, and moves back with rejoin=try once the room
\* answers
RetryBack(r) ==
    /\ tab[r].page = "lost"
    /\ tab' = [tab EXCEPT ![r].page = "reloading", ![r].url = "try"]
    /\ UNCHANGED <<room, wire>>

\* a page load (moveToRoom or a reload) keeps the address: the game boots
\* again, and RoomEntry shows the taken screen for rejoin=taken, or
\* SeatedLobby opens a seat with the same member key.  The old page's last
\* messages and the new page's seat travel on different sockets, so the
\* room may hear them in either order; a dead link (Break) loses them.
\* OldPageFirst keeps only the order in which the old page's messages arrive
\* first.
\* The checks set it, because without it pair alone runs past ten minutes.
\* The known defect lateQuitRejoins clears it.
Reloaded(r) ==
    /\ tab[r].page = "reloading"
    /\ OldPageFirst => Delivered(r)
    /\ LET t == [tab[r] EXCEPT !.handoff = "lobby", !.prep = FALSE, !.door = -1,
                               !.game = "booting", !.fresh = FALSE, !.quit = FALSE,
                               !.bootQuit = FALSE]
       IN IF t.url = "taken"
          THEN /\ tab' = [tab EXCEPT ![r] = [t EXCEPT !.page = "taken"]]
               /\ UNCHANGED wire
          ELSE \E i \in FreeSlots(r) : OpenSeat(r, i, [t EXCEPT !.page = "room"])
    /\ UNCHANGED room

\* the game module boots (use-flow.ts ready)
GameReady(r) ==
    /\ tab[r].game = "booting"
    /\ tab[r].page = "room"
    /\ tab' = [tab EXCEPT ![r].game = "ready"]
    /\ UNCHANGED <<room, wire>>

\* the race screen shows results once the seat has ended
ResultsShown(r) ==
    /\ tab[r].page = "race"
    /\ tab[r].seat = "ended"
    /\ tab' = [tab EXCEPT ![r].page = "results"]
    /\ UNCHANGED <<room, wire>>

(***************************************************************************)
(* What players do, each from a small budget.                              *)
(***************************************************************************)

\* open the invite link: a page load into the room
EnterRoom(r) ==
    /\ Acting(r)
    /\ tab[r].page = "bar"
    /\ tab' = [tab EXCEPT ![r] = [Act(@) EXCEPT !.page = "reloading", !.url = "try"]]
    /\ UNCHANGED <<room, wire>>

\* BarLobby Ready: seat-client.ts setReady
PressReady(r) ==
    /\ Acting(r)
    /\ tab[r].page = "room"
    /\ tab[r].seat = "lobby"
    /\ LET s == CurOf(r)
       IN /\ wire.cs[s] = "open"
          /\ ~room.broken[s]
          /\ wire.toH[s] = <<>>
          /\ wire' = [wire EXCEPT !.toH[s] = Append(@, "ready")]
    /\ tab' = [tab EXCEPT ![r] = Act(@)]
    /\ UNCHANGED room

\* Leave in the room: room-lobby.tsx leaveRoom, seat-client.ts leaveRoom
\* (SEAT_LEFT 4410), then onBack to the bar
PressLeave(r) ==
    /\ Acting(r)
    /\ tab[r].page = "room"
    /\ LET t == tab[r]
           live == t.seat \in SeatLive
       IN /\ wire' = IF live THEN CloseFrom(wire, CurOf(r), "quit4410") ELSE wire
          /\ tab' = [tab EXCEPT ![r] =
                       [Act(t) EXCEPT !.page = "bar",
                                      !.seat = IF live THEN "left" ELSE @,
                                      !.quit = live,
                                      !.door = -1, !.reopen = -1]]
    /\ UNCHANGED room

\* the game fails to boot: RoomLobby shows RoomFailedScreen and
\* SeatedLobby's cleanup closes the seat by room-handoff.ts seatClosing;
\* off, it closes by leave (SEAT_QUIT 4411)
GameFail(r) ==
    /\ Acting(r)
    /\ tab[r].game = "booting"
    /\ tab[r].page = "room"
    /\ LET t == tab[r]
           live == t.seat \in SeatLive
           code == IF GuardBootLeavesRoom THEN "quit4410" ELSE "quit4411"
       IN /\ wire' = IF live THEN CloseFrom(wire, CurOf(r), code) ELSE wire
          /\ tab' = [tab EXCEPT ![r] =
                       [Act(t) EXCEPT !.game = "failed", !.page = "failed",
                                      !.seat = IF live THEN "left" ELSE @,
                                      !.bootQuit = live,
                                      !.door = -1, !.reopen = -1]]
    /\ UNCHANGED room

\* rejoin.tsx SignalLost Back to bar: moveToRoom with rejoin=no.  gaveUp is
\* a ghost that records the race the player gave up.
GiveUp(r) ==
    /\ Acting(r)
    /\ tab[r].page = "lost"
    /\ tab' = [tab EXCEPT ![r] = [Act(@) EXCEPT !.page = "reloading", !.url = "no",
                                                 !.gaveUp = room.run]]
    /\ UNCHANGED <<room, wire>>

\* reload the page: the browser closes the seat as the page goes away
Reload(r) ==
    /\ Acting(r)
    /\ tab[r].page \in {"room", "race", "failed", "lost", "taken"}
    /\ wire' = CloseFrom(wire, CurOf(r), "close1001")
    /\ tab' = [tab EXCEPT ![r] = [Act(@) EXCEPT !.page = "reloading",
                                                 !.door = -1, !.reopen = -1]]
    /\ UNCHANGED room

\* close the tab for good
CloseTab(r) ==
    /\ Acting(r)
    /\ tab[r].page \in {"bar", "room", "race", "results", "failed", "lost", "taken"}
    /\ wire' = CloseFrom(wire, CurOf(r), "close1001")
    /\ tab' = [tab EXCEPT ![r] = [Act(@) EXCEPT !.page = "gone",
                                                 !.door = -1, !.reopen = -1]]
    /\ UNCHANGED room

\* results: Back to the lobby (navigation.ts rematch, moveToRoom)
Rematch(r) ==
    /\ Acting(r)
    /\ tab[r].page = "results"
    /\ tab' = [tab EXCEPT ![r] = [Act(@) EXCEPT !.page = "reloading", !.url = "try"]]
    /\ UNCHANGED <<room, wire>>

\* results: Continue to the bar with no room
Continue(r) ==
    /\ Acting(r)
    /\ tab[r].page = "results"
    /\ tab' = [tab EXCEPT ![r] = [Act(@) EXCEPT !.page = "bar"]]
    /\ UNCHANGED <<room, wire>>

\* the tab is hidden long enough that throttled pings stop reaching the
\* room inside SILENT_SEAT_MS; the link itself still works
Hide(r) ==
    /\ Acting(r)
    /\ tab[r].page \in {"room", "race"}
    /\ LET s == CurOf(r)
       IN /\ wire.cs[s] = "open"
          /\ room.sock[s] = "present"
          /\ room.quiet[s] = -1
          /\ ~room.broken[s]
          /\ room' = [room EXCEPT !.quiet[s] = Quiet]
    /\ tab' = [tab EXCEPT ![r] = Act(@)]
    /\ UNCHANGED wire

\* the link dies: nothing more gets through either way, the room stops
\* hearing pings and the browser stops hearing pongs
Break(r) ==
    /\ Acting(r)
    /\ tab[r].page \in {"room", "race"}
    /\ LET s == CurOf(r)
       IN /\ wire.cs[s] \in {"connecting", "open"}
          /\ ~room.broken[s]
          /\ room' = [room EXCEPT !.broken[s] = TRUE, !.out[s] = <<>>,
                                  !.quiet[s] = IF room.sock[s] = "present" THEN Quiet ELSE -1]
          /\ wire' = [wire EXCEPT !.toH[s] = <<>>, !.dead[s] = ClientDead]
    /\ tab' = [tab EXCEPT ![r] = Act(@)]

(***************************************************************************)
(* Time.                                                                   *)
(***************************************************************************)

ClientUrgent(r) ==
    LET t == tab[r]
    IN \/ DoorMoment(r) /\ t.door = -1
       \/ ~DoorMoment(r) /\ t.door # -1
       \/ DoorMoment(r) /\ t.handoff = "lobby" /\ ~t.prep
       \/ WaitingForRace(r) /\ (GuardLateRoomRacing \/ t.fresh)
       \/ t.fresh /\ ~WaitingForRace(r)
       \/ t.door = 0
       \/ t.reopen = 0 /\ t.page = "room"

Urgent ==
    \/ \E s \in Sock :
         \/ wire.toH[s] # <<>>
         \/ room.out[s] # <<>> /\ wire.cs[s] \in {"open", "closed"}
         \/ wire.cs[s] = "connecting" /\ room.sock[s] # "none"
         \/ wire.cs[s] = "open" /\ ~wire.pinged[s]
         \/ room.quiet[s] = 0 /\ room.sock[s] = "present"
         \/ wire.dead[s] = 0
         \/ Reusable(s)
    \/ room.startLeft = 0
    \/ \E n \in Runs : room.deadline[n] = 0
    \/ 0 \in room.graces
    \/ \E k \in Riders : room.mem[k] = "away" /\ (room.awayLeft[k] = 0 \/ ~GuardSweepWaits)
    \/ \E k \in Riders : room.pres[k] = "held" /\ room.holdLeft[k] = 0
    \/ room.phase = "racing" /\ Over(room)
    \/ room.phase = "waiting" /\ room.run < MaxRaces /\ Due(room)
    \/ \E r \in Riders : ClientUrgent(r)

Tick ==
    /\ ~Urgent
    /\ room' = [room EXCEPT
                 !.startLeft = Dec(@),
                 !.deadline = [n \in Runs |-> Dec(room.deadline[n])],
                 !.graces = {g - 1 : g \in room.graces},
                 !.quiet = [s \in Sock |-> Dec(room.quiet[s])],
                 !.awayLeft = [k \in Riders |->
                                 IF room.mem[k] = "away" THEN Dec(room.awayLeft[k])
                                 ELSE room.awayLeft[k]],
                 !.holdLeft = [k \in Riders |->
                                 IF room.pres[k] = "held" THEN Dec(room.holdLeft[k])
                                 ELSE room.holdLeft[k]],
                 !.clock = IF @ = -1 THEN -1 ELSE Min(@ + 1, Wait)]
    /\ wire' = [wire EXCEPT !.dead = [s \in Sock |-> Dec(wire.dead[s])]]
    /\ tab' = [r \in Riders |-> [tab[r] EXCEPT !.door = Dec(@), !.reopen = Dec(@)]]

(***************************************************************************)
(* The specification.                                                      *)
(***************************************************************************)

Init ==
    /\ room = [phase |-> "waiting", run |-> 0, startLeft |-> -1,
               deadline |-> [n \in Runs |-> -1],
               deadlineHit |-> [n \in Runs |-> FALSE],
               graces |-> {},
               sock |-> [s \in Sock |-> "none"],
               role |-> [s \in Sock |-> "lobby"],
               quiet |-> [s \in Sock |-> -1],
               out |-> [s \in Sock |-> <<>>],
               broken |-> [s \in Sock |-> FALSE],
               pres |-> [k \in Riders |-> "out"],
               seatInc |-> [k \in Riders |-> 0],
               loaded |-> [k \in Riders |-> FALSE],
               done |-> [k \in Riders |-> FALSE],
               holdLeft |-> [k \in Riders |-> -1],
               letGo |-> [k \in Riders |-> FALSE],
               mem |-> [k \in Riders |-> "none"],
               ready |-> [k \in Riders |-> FALSE],
               awayLeft |-> [k \in Riders |-> 0],
               colour |-> [k \in Riders |-> 0],
               inc |-> [k \in Riders |-> 0],
               lPhase |-> "gathering",
               clock |-> -1,
               freed |-> [k \in Riders |-> FALSE],
               arrived |-> [k \in Riders |-> FALSE]]
    /\ wire = [cs |-> [s \in Sock |-> "free"],
               toH |-> [s \in Sock |-> <<>>],
               dead |-> [s \in Sock |-> -1],
               pinged |-> [s \in Sock |-> FALSE],
               quitHeard |-> [s \in Sock |-> FALSE]]
    /\ tab = [r \in Riders |->
                [page |-> "bar", url |-> "try", cur |-> 1, seat |-> "connecting",
                 race |-> FALSE, back |-> FALSE, handoff |-> "lobby", prep |-> FALSE,
                 door |-> -1, reopen |-> -1, game |-> "ready", fresh |-> FALSE,
                 quit |-> FALSE, bootQuit |-> FALSE, gaveUp |-> 0, told |-> FALSE,
                 acts |-> 0]]

System ==
    \/ \E s \in Sock :
         \/ HostRecv(s) \/ HostQuiet(s)
         \/ ClientOpened(s) \/ ClientPing(s) \/ ClientRecv(s) \/ ClientDiscard(s)
         \/ ClientDeadFire(s) \/ Reuse(s)
    \/ \E n \in Runs : HostDeadline(n)
    \/ HostStartMoment \/ HostEnd \/ HostGrace \/ HostConsider
    \/ \E r \in Riders :
         \/ HostSweep(r) \/ RiderDone(r) \/ HostHoldOver(r)
         \/ DoorArm(r) \/ DoorDisarm(r) \/ RaceBegun(r) \/ DoorElapsed(r)
         \/ RoomRacing(r) \/ RacingSeen(r)
         \/ \E o \in Outcomes : PrepareDone(r, o)
         \/ Reopened(r) \/ RetryBack(r) \/ Reloaded(r) \/ GameReady(r)
         \/ ResultsShown(r)
    \/ Tick

Player ==
    \E r \in Riders :
        \/ EnterRoom(r) \/ PressReady(r) \/ PressLeave(r) \/ GameFail(r)
        \/ GiveUp(r) \/ Reload(r) \/ CloseTab(r) \/ Rematch(r) \/ Continue(r)
        \/ Hide(r) \/ Break(r)

Next == System \/ Player

Fairness ==
    /\ \A s \in Sock :
         /\ WF_vars(HostRecv(s)) /\ WF_vars(HostQuiet(s))
         /\ WF_vars(ClientOpened(s)) /\ WF_vars(ClientPing(s)) /\ WF_vars(ClientRecv(s))
         /\ WF_vars(ClientDiscard(s)) /\ WF_vars(ClientDeadFire(s)) /\ WF_vars(Reuse(s))
    /\ \A n \in Runs : WF_vars(HostDeadline(n))
    /\ WF_vars(HostStartMoment) /\ WF_vars(HostEnd) /\ WF_vars(HostGrace)
    /\ WF_vars(HostConsider)
    /\ \A r \in Riders :
         /\ WF_vars(HostSweep(r)) /\ WF_vars(RiderDone(r)) /\ WF_vars(HostHoldOver(r))
         /\ WF_vars(DoorArm(r)) /\ WF_vars(DoorDisarm(r)) /\ WF_vars(RaceBegun(r))
         /\ WF_vars(DoorElapsed(r)) /\ WF_vars(RoomRacing(r)) /\ WF_vars(RacingSeen(r))
         /\ WF_vars(\E o \in Outcomes : PrepareDone(r, o))
         /\ WF_vars(Reopened(r)) /\ WF_vars(RetryBack(r)) /\ WF_vars(Reloaded(r))
         /\ WF_vars(GameReady(r)) /\ WF_vars(ResultsShown(r))
    /\ WF_vars(Tick)

Spec == Init /\ [][Next]_vars /\ Fairness

\* tabs with their own keys are interchangeable, so a safety check may treat
\* them as one
RiderSymmetry == Permutations(Riders)

(***************************************************************************)
(* The rules, as a player would feel them.                                 *)
(***************************************************************************)

PresentOf(k) == {s \in Sock : Key(s[1]) = k /\ room.sock[s] = "present"}

\* A spot is never held by two riders: the room holds at most one socket
\* for each member.  Guard: host.ts seat retires the replaced socket.
OneSocketPerMember ==
    \A k \in Riders : Cardinality(PresentOf(k)) <= 1

\* Two members never stand in the same bar spot.  Guard: lobby.ts freeColour.
SlotNeverShared ==
    \A k1, k2 \in Riders :
        (k1 # k2 /\ room.mem[k1] # "none" /\ room.mem[k2] # "none")
            => room.colour[k1] # room.colour[k2]

\* Nobody walks the bar without a seat behind them.  Guard: host.ts drop
\* marks the member away or gone.
NoGhostInBar ==
    \A k \in Riders : room.mem[k] = "here" => PresentOf(k) # {}

\* Once the room has let go of a rider who left, it holds no spot for them.
\* The room cannot hear a Leave sent before the socket opened (the browser
\* fails it, and the room hears 1006), one that crosses the room's own
\* close of the seat, or one lost with the link.  Then it may keep only a
\* hold for a browser that had reached it, and that hold runs out.
FreedAfterQuit(r) ==
    LET k == Key(r)
    IN (Delivered(r) /\ PresentOf(k) = {})
           => \/ room.mem[k] = "none"
              \/ /\ ~wire.quitHeard[CurOf(r)]
                 /\ room.mem[k] = "away"
                 /\ room.arrived[k]

\* Leave frees the spot.  Guards: host.ts drop sends SEAT_LEFT to
\* lobby.leave, and lobby.ts away frees a member who never arrived.
LeaveFreesSpot ==
    \A r \in Riders :
        (tab[r].quit /\ tab[r].page \in {"bar", "gone"}) => FreedAfterQuit(r)

\* A rider whose game failed to boot holds no spot.  Guard: room-handoff.ts
\* seatClosing closes with leaveRoom when the boot failed.
BootFailureFreesSpot ==
    \A r \in Riders :
        (tab[r].bootQuit /\ tab[r].page = "failed") => FreedAfterQuit(r)

\* A dropped rider keeps the same spot until awaySeconds run out.  Guard:
\* lobby.ts sweep keeps an away member for awaySeconds.
HoldLastsAway ==
    [][\A k \in Riders :
         (room.mem[k] # "none" /\ room'.mem[k] = "none")
            => (room'.freed[k] \/ (room.mem[k] = "away" /\ room.awayLeft[k] = 0))]_vars

\* A dropped rider who comes back within the hold is the same member with
\* the same bar spot.  Guard: lobby.ts join finds the member by key.
RejoinKeepsSpot ==
    [][\A k \in Riders :
         (room.mem[k] # "none" /\ room'.mem[k] # "none")
            => (room'.inc[k] = room.inc[k] /\ room'.colour[k] = room.colour[k])]_vars

\* A race never starts with a seat that cannot ride: it seats someone, and
\* every seat is a socket the room holds for a member who is here.  Guard:
\* host.ts drop retires the socket.
SeatsCanRide ==
    [][(room.phase = "waiting" /\ room'.phase = "loading")
         => /\ \E k \in Riders : room'.pres[k] = "here"
            /\ \A k \in Riders : room'.pres[k] = "here"
                  => /\ room'.mem[k] = "here"
                     /\ \E s \in Sock : /\ Key(s[1]) = k
                                        /\ room'.sock[s] = "present"
                                        /\ room'.role[s] = "seated"]_vars

\* this step put a returning socket of member k on its held seat
RejoinedNow(k) ==
    \E s \in Sock : /\ Key(s[1]) = k
                    /\ room.sock[s] = "none"
                    /\ room'.sock[s] = "present"
                    /\ room'.role[s] = "seated"

\* The countdown never leaves a loading rider behind before this race's own
\* loadDeadlineSeconds.  It does not wait for a rider whose seat the room holds
\* (host.ts holdSeat), so a rider whose new socket replaced the old one in
\* the same step gets back on a bike whose countdown has begun.  Guards:
\* host.ts countDownOnceLoaded checks stillLoading, host-phase.ts
\* loadingOver checks the run.
FairStart ==
    [][(room.phase = "loading" /\ room'.phase = "countdown")
         => \/ \A k \in StillLoading(room') : RejoinedNow(k)
            \/ room'.deadlineHit[room.run]]_vars

\* the room seats this tab's socket in a race whose countdown has begun,
\* and the link works
SeatedInBegunRace(r) ==
    LET s == CurOf(r)
    IN /\ room.sock[s] = "present"
       /\ room.role[s] = "seated"
       /\ room.phase \in {"countdown", "racing"}
       /\ ~room.broken[s]

WaitsForBegunRace(r) ==
    /\ tab[r].page = "room"
    /\ tab[r].handoff = "waitingForRoom"
    /\ (tab[r].seat = "racing" \/ SeatedInBegunRace(r))

\* A rider whose game is ready rides the race the room is running, back on
\* their bike too: no time passes while their room page waits for it.
\* Guards: room-lobby.tsx keys the roomRacing effect on the handoff as
\* well as on racing, and host.ts rejoin sends a begun countdown.
ReadyRiderRides ==
    [][Tick => \A r \in Riders : ~WaitsForBegunRace(r)]_vars

\* A dropped rider who comes back as the same member while the room still
\* holds their bike and their spot gets back on it, unless they chose
\* rejoin=no.  A rider the lobby made a new member does not own the bike.
\* Guards:
\* host.ts seat retires a replaced socket with a hold, and looks up the
\* held seat (claimHold, rejoin).
BackOnBike ==
    [][\A s \in Sock :
         LET k == Key(s[1])
         IN (/\ room.sock[s] = "none"
             /\ room'.sock[s] = "present"
             /\ Head(wire.toH[s]) = "seat"
             /\ room.pres[k] \in InRace
             /\ room.holdLeft[k] # 0
             /\ room.mem[k] # "none"
             /\ room.seatInc[k] = room.inc[k])
              => (room'.pres[k] = "here" /\ room'.role[s] = "seated")]_vars

\* The room lets go of a dropped rider's bike only when the hold runs out,
\* the race ends, or the rider or their game chose to leave this race
\* (Leave, a failed build, or Back to bar on SignalLost).  Guard: host.ts
\* partingOf holds the seat for any close but a Leave.
BikeHeldForHold ==
    [][\A k \in Riders :
         (room.pres[k] \in InRace /\ room'.pres[k] = "left")
            => (room'.letGo[k] \/ (room.pres[k] = "held" /\ room.holdLeft[k] = 0))]_vars

\* A rider back after the hold ran out does not get the bike, even when the
\* hold's timer has not woken yet.  Guard: host.ts claimHold compares the
\* hold's deadline with the room's clock.
HoldEndsOnTime ==
    [][\A k \in Riders :
         (room.pres[k] = "held" /\ room.holdLeft[k] = 0) => room'.pres[k] # "here"]_vars

\* A tab that hears another tab of its browser took its race seat stays on
\* the taken screen until its player acts, so two tabs never trade the seat
\* by themselves.  Guard: room-handoff.ts seatChange sends a seat refused
\* as "replaced" to rejoin=taken.
TakenTabStaysPut ==
    \A r \in Riders : tab[r].told => tab[r].page \in {"reloading", "taken"}

Settled(r) ==
    \/ tab[r].page \in {"bar", "results", "failed", "gone", "race", "taken"}
    \/ /\ tab[r].page = "room"
       /\ tab[r].seat \in {"lobby", "refused"}
       /\ tab[r].handoff = "lobby"

\* Every tab ends in the bar lobby, riding, on results, on a screen that
\* says why it is out, or closed, never stuck.  Guards: room-lobby.tsx
\* reopens a lost lobby seat, and seatChange sends an ended seat back to
\* the lobby.
NeverStuck == \A r \in Riders : []<>Settled(r)

=============================================================================
