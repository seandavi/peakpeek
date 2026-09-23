# Working rules

- SPEC.md is the source of truth. If code and spec disagree, stop and ask.
- Classic <script> tags only. index.html and test.html must work when double-clicked
  (file://): no modules, no fetch of local files, no build step, no packages, no CDNs.
- Edit only the files your issue owns (SPEC.md §8). If you need another, stop and ask.
- The answers in examples/fixture.js were written by a person. Never edit them to make a
  test pass: report the mismatch.
- In SPEC.md, touch only your issue's checkboxes in §8, and its Status line up to
  "Done — agent". Signing it off is the maintainer's.
- Don't commit: the maintainer commits each issue after review.
- Don't edit LEDGER.md: the maintainer writes it. Put what you checked in your report.
