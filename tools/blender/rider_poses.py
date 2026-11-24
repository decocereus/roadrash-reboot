"""The frames of a rider GLB's pose clip, one pose a frame, in file order.

Everything that reads or writes the clip finds a pose by its name here: `rider_rig.py` writes the frames in this order
and `rider_moves.py` reads `stand`. `POSE_FRAMES` in apps/web/src/game/assets.ts lists the same names, with null for
the frames in UNUSED, and apps/web/test/rider-poses.test.ts fails when the two lists differ.

The UNUSED frames held the old run cycle. The six named riders' GLBs were painted outside these scripts and still
carry those frames, so every rider keeps them and nothing reads them.
"""

POSE_FRAMES = (
    "rest",
    "seated",
    "punch_l",
    "punch_r",
    "kick_l",
    "kick_r",
    "windup_l",
    "windup_r",
    "swing_l",
    "swing_r",
    "unused_a",
    "unused_b",
    "lift",
    "lying",
    "tumble_a",
    "tumble_b",
    "surrender",
    "stand",
)
UNUSED = ("unused_a", "unused_b")
ON_BIKE = ("seated", "punch_l", "punch_r", "kick_l", "kick_r", "windup_l", "windup_r", "swing_l", "swing_r")
