#!/bin/bash
J=/var/tmp/rushline-round4/job3
until grep -q "today3 done" $J/today3.log; do timeout 3 tail -f /dev/null; done
cp $J/frames/today/stress/facts.json $J/frames/today/stress/facts-corrected.json
mkdir -p $J/frames/today-corrected; cp $J/frames/today/stress/t01800.png $J/frames/today/stress/t02140.png $J/frames/today-corrected/
export RUSHLINE_BROWSER_HOST=linux-intel
cd /var/tmp/rushline-r4-a || exit 9
export JOB3='{"stress":[2780,2796]}'
node tools/verify/rushline.ts bench job3-today4 -- sh $J/hold.sh job3 today 2>&1 | tail -3 | cut -c1-260
cp $J/frames/today-corrected/t01800.png $J/frames/today-corrected/t02140.png $J/frames/today/stress/
echo "today4 done $(date -Is)"
