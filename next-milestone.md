---
description: Plan and build the next Playhead milestone from the spec
---

1. Read `docs/PROGRESS.md` to find the last completed milestone. If it does not exist, the next milestone is 1.
2. Read Section 16 of `docs/PLAYHEAD_BUILD_SPEC.md` and every spec section that the next milestone depends on.
3. Write an implementation plan for that milestone: tasks in order, files to create or change, database migrations, API endpoints, UI screens, and tests. List any question the spec does not answer.
4. Stop and wait for approval of the plan.
5. After approval, build the milestone task by task. Run the tests after each task and fix failures before moving on.
6. Start the app locally and check the milestone works end to end in the browser.
7. Update `docs/PROGRESS.md` and `docs/DECISIONS.md`.
8. Summarize what was built, how to test it, and what the next milestone is.
