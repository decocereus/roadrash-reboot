#!/bin/bash
B=/var/tmp/rushline-r4-b; A=/var/tmp/rushline-perf-gpu-a; J=/var/tmp/rushline-round4/job3
export RUSHLINE_BROWSER_HOST=linux-intel
echo "start $(date -Is)"
cd $A || exit 9
UA=$(node $B/tools/verify/rushline.ts up --slot 0 --path /kit 2>&1 | tee $J/up-a.log | sed -n 's/^RUN=//p')
cd $B || exit 9
UB=$(node tools/verify/rushline.ts up --slot 1 --path /kit 2>&1 | tee $J/up-b.log | sed -n 's/^RUN=//p')
echo "A=$UA B=$UB"
[ -n "$UA" ] && [ -n "$UB" ] || { echo "rv up failed"; [ -n "$UA" ] && node tools/verify/rushline.ts down --run "$UA"; [ -n "$UB" ] && node tools/verify/rushline.ts down --run "$UB"; exit 8; }
(cd $A && node $B/tools/verify/rushline.ts doctor --run "$UA") 2>&1 | cut -c1-160
node tools/verify/rushline.ts doctor --run "$UB" 2>&1 | cut -c1-160
pnpm perf:gpu --a "$UA" --b "$UB" --baseline-ref 4a3249adf14e --budgets $J/budgets-intel-temp.json
echo "lane exit=$? $(date -Is)"
node tools/verify/rushline.ts doctor --run "$UB" 2>&1 | grep -i "gpu:" | cut -c1-160
(cd $A && node $B/tools/verify/rushline.ts down --run "$UA") 2>&1 | tail -1 | cut -c1-160
node tools/verify/rushline.ts down --run "$UB" 2>&1 | tail -1 | cut -c1-160
node tools/verify/rushline.ts list
node tools/verify/rushline.ts desktop status
echo "part3 done $(date -Is)"
