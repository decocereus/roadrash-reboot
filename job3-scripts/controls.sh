#!/bin/bash
# Waits for land2-today, then the today-side crash and car controls, then Breakwater's finish on landing.
J=/var/tmp/rushline-round4/job3
until grep -q "today done" $J/land2-today.log; do timeout 3 tail -f /dev/null; done
export RUSHLINE_BROWSER_HOST=linux-intel
cp $J/frames/today/stress/facts.json $J/frames/today/stress/facts-first.json; cp $J/frames/today/stress/ticklog.json $J/frames/today/stress/ticklog-first.json; cp $J/frames/today/breakwater/facts.json $J/frames/today/breakwater/facts-first.json
cd /var/tmp/rushline-r4-a || exit 9
export JOB3='{"breakwater":[12600],"crash":true,"stress":[2492,2498,2780,2796,2815]}'
node tools/verify/rushline.ts bench job3-today2 -- sh $J/hold.sh job3 today 2>&1 | tail -3 | cut -c1-260
echo "today controls done $(date -Is)"
cp $J/frames/landing/breakwater/facts.json $J/frames/landing/breakwater/facts-first.json
cd /var/tmp/rushline-r4-b || exit 9
export JOB3='{"breakwater":[13600,13700,13740]}'
node tools/verify/rushline.ts bench job3-land3 -- sh $J/hold.sh job3 landing 2>&1 | tail -3 | cut -c1-260
echo "land3 done $(date -Is)"
