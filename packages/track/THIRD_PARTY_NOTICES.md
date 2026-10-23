# Third-party notices

## FreeBSD msun

`src/math.ts`, `src/math-atan.ts`, `src/math-kernels.ts`, `src/math-reduction.ts` and `src/math-words.ts` are a TypeScript transcription of these files from FreeBSD's `lib/msun/src`, at tag `release/12.2.0` (commit `1d21fe9cea3f530b4cfca495632d5a1595a32270`):

| File | Transcribed into |
| --- | --- |
| `s_sin.c`, `s_cos.c` | `sin` and `cos` in `math.ts` |
| `k_sin.c`, `k_cos.c` | `math-kernels.ts` |
| `e_rem_pio2.c`, the paths up to the medium case | `math-reduction.ts` |
| `s_atan.c` | `math-atan.ts` |
| `rnint` in `math_private.h` | the quadrant rounding in `math-reduction.ts` |

Changes from the C:

- The large-argument path of `e_rem_pio2.c` and its `k_rem_pio2.c` are not carried over. Every finite angle takes the medium path, which is accurate below about 1.6e6 radians and stays deterministic above it.
- `sin`, `cos` and `atan` return `Number.NaN` for a NaN input, and `sin` and `cos` for an infinite one, where the C returns `x - x` or `x + x`.
- The C reads the high word of a double through a union. The TypeScript reads it through a `Uint32Array` view of a one-element `Float64Array`, and replaces the bit masks and shifts with exact arithmetic.
- The coefficients are written as the shortest decimal that rounds to the C file's hexadecimal words.

Each of those files carries this notice:

```text
Copyright (C) 1993 by Sun Microsystems, Inc. All rights reserved.

Developed at SunSoft, a Sun Microsystems, Inc. business.
Permission to use, copy, modify, and distribute this
software is freely granted, provided that this notice
is preserved.
```

`s_sin.c`, `s_cos.c`, `s_atan.c` and `math_private.h` say "Developed at SunPro" where the others say "SunSoft". `e_rem_pio2.c` adds "Optimized by Bruce D. Evans."
