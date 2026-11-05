#!/bin/bash
cd /var/tmp/rushline-r4-b || exit 9
[ "$(git rev-parse HEAD | cut -c1-8)" = 7fec2e9b ] || { echo wrong head; exit 9; }
export RUSHLINE_BROWSER_HOST=linux-intel
export JOB3='{"breakwater":[4200,4600,5000,5400,5800,6200,6600,7000,7400,7800,8200,8600,9000,9400,9800,10200,10600,11000,11400,11800,12200,12600,13000,13400,13700,13900],"crash":true,"stress":[1800,2026,2032,2044,2060,2140,2217,2221,2227,2235,2247,2265,2492,2498,2510,2731,2737,2745,2760,2780,2786,2796,2815,2840,2870],"bar":["door-dusk","door-night","room-night","follow-dusk"]}'
node tools/verify/rushline.ts bench job3-land -- sh /var/tmp/rushline-round4/job3/hold.sh job3 landing 2>&1 | tail -12 | cut -c1-300
echo "land done exit=$? $(date -Is)"
