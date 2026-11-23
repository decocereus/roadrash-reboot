# Universal Animation Library, Standard

`tools/blender/rider_moves.py` retargets four loops from Quaternius' Universal Animation Library (Standard) onto the rider skeleton and writes `models/rider_moves.glb`. Models are not committed, so the library file comes from the zip below, checked against its hash.

|  |  |
| --- | --- |
| Source page | https://opengameart.org/content/universal-animation-library, uploaded by Quaternius on 2025-04-16 |
| Download | https://opengameart.org/sites/default/files/universal_animation_librarystandard.zip, fetched 2026-11-23 |
| Zip sha256 | `18ff1a7215f4852b320203e8aaf02a1578b5c8eef9027fbaedfcedc7b85a3ac2` |
| File used | `Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb`, sha256 `1b7bf67866360665426bb99e4c71bd619f19b408453c24e30f0c3071601eee5c` |
| Cut | `tools/blender/out/ual_moves.glb`, sha256 `2705ba07e7f016ed088b542382d63368d3850983c613c413372eb578cc16308d` from Blender 5.2 |
| Licence | CC0 1.0 Universal, full text in `LICENSE` beside this file |

## Licence

The zip's `License.txt` reads:

```
License:
CC0 1.0 Universal (CC0 1.0)
Public Domain Dedication
https://creativecommons.org/publicdomain/zero/1.0/

Models by @Quaternius
```

The OpenGameArt page lists the pack as CC0. Quaternius has since published the Quaternius Asset License (QAL) v1.0, dated 2026-08-28, at https://quaternius.com/license.html. Its section 7 says a change to the terms does not apply to assets already obtained, so the copy fetched from this CC0 upload stays CC0. QAL asks for no attribution either way; the credit above is a courtesy.

## Cut

Only the four loops the game plays and the library's skeleton are kept; the mesh, the other animations and the Unity and Unreal files are left out. To make the cut, check the zip and trim the Godot file:

```sh
shasum -a 256 universal_animation_librarystandard.zip
unzip universal_animation_librarystandard.zip -d <unzipped>
Blender -b -P tools/blender/rider_moves.py -- trim "<unzipped>/Animation Library[Standard]/Godot/AnimationLibrary_Godot_Standard.glb"
```

| Library loop   | Game loop |
| -------------- | --------- |
| `Idle_Loop`    | `idle`    |
| `Walk_Loop`    | `walk`    |
| `Jog_Fwd_Loop` | `jog`     |
| `Sprint_Loop`  | `sprint`  |
