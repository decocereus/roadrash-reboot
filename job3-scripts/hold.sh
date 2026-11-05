#!/bin/sh
HOLD=uhd630-job3
node tools/verify/rushline.ts desktop up "$HOLD"
node /var/tmp/rushline-round4/job3/capture.mjs "$@"
status=$?
node tools/verify/rushline.ts desktop down "$HOLD"
exit $status
