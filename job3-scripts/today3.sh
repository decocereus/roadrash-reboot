#!/bin/bash
J=/var/tmp/rushline-round4/job3
until grep -q "land3 done" $J/controls.log; do timeout 3 tail -f /dev/null; done
export RUSHLINE_BROWSER_HOST=linux-intel
mkdir -p $J/frames/today-stretched; cp -r $J/frames/today/breakwater $J/frames/today-stretched/; cp -r $J/frames/today/stress $J/frames/today-stretched/
cd /var/tmp/rushline-r4-a || exit 9
export JOB3='{"realtime":2140,"breakwater":[4200,5800,9800],"stress":[1800,2140]}'
node tools/verify/rushline.ts bench job3-today3 -- sh $J/hold.sh job3 today 2>&1 | tail -5 | cut -c1-300
echo "today3 done $(date -Is)"
