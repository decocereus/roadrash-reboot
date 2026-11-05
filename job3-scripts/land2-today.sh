#!/bin/bash
export RUSHLINE_BROWSER_HOST=linux-intel
cd /var/tmp/rushline-r4-b || exit 9
[ "$(git rev-parse HEAD | cut -c1-8)" = 7fec2e9b ] || { echo wrong head; exit 9; }
T=$(python3 -c "print(list(range(2440,2449))+list(range(2526,2546))+list(range(2610,2619)))")
export JOB3="{\"stress\":$T}"
node tools/verify/rushline.ts bench job3-land2 -- sh /var/tmp/rushline-round4/job3/hold.sh job3 landing 2>&1 | tail -4 | cut -c1-260
echo "land2 done $(date -Is)"
cd /var/tmp/rushline-r4-a || exit 9
[ "$(git rev-parse HEAD | cut -c1-8)" = e6eefae5 ] || { echo wrong head; exit 9; }
export JOB3='{"breakwater":[4200,5800,9800],"stress":[1800,2140],"bar":["door-dusk","door-night","room-night","follow-dusk"]}'
node tools/verify/rushline.ts bench job3-today -- sh /var/tmp/rushline-round4/job3/hold.sh job3 today 2>&1 | tail -6 | cut -c1-260
echo "today done $(date -Is)"
