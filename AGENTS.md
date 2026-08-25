<!-- BEGIN:nextjs-agent-rules -->

# This is NOT the Next.js you know

This version has breaking changes — APIs, conventions, and file structure may all differ from your training data. Read the relevant guide in `node_modules/next/dist/docs/` (resolved from this file's directory; in monorepos the `next` package may not be visible from the repo root) before writing any code. Heed deprecation notices.

This block is written and re-added by `next dev` — verify at `node_modules/next/dist/server/lib/generate-agent-files.js`. Removing it from a diff only re-creates the uncommitted change; committing it with your work keeps the tree clean.

<!-- END:nextjs-agent-rules -->


## Testing and Verification

Testing is part of the implementation, not an optional follow-up step.

* Every new feature, behavior, bug fix, or meaningful code change must include tests unless the user explicitly says not to add tests.
* Do not decide that a change is "too small" or "too simple" to require testing. The default assumption is that new functionality requires a test.
* Tests must exercise the actual code that was added or changed. Do not write tests that merely reproduce the implementation's logic or only verify mocked behavior.
* Prefer isolated tests that mock external dependencies such as APIs, databases, network requests, filesystem operations, clocks, or other services when appropriate. The code being tested itself should remain real.
* Tests should verify the observable behavior of the implementation, including its expected outputs, state changes, calls to dependencies, and relevant error or edge cases.
* Bug fixes should include a regression test that would have failed before the fix and passes afterward.
* Follow the repository's existing testing framework, conventions, directory structure, and patterns whenever they exist.

### Verification Before Declaring Completion

Do not say that something is "implemented," "finished," "working," "fixed," or otherwise complete based only on having written the code.

Before declaring a task complete:

1. Run the new tests you added.
2. Run any existing tests directly related to the changed code.
3. Run the broader test suite when practical and appropriate for the repository.
4. Run relevant type checks, linting, builds, or other validation commands used by the repository.
5. Confirm that the tests are exercising the actual new functionality rather than succeeding because the important behavior was mocked away.

If a test or validation command fails, investigate and fix the failure when it is caused by the implementation. Do not describe the implementation as complete while relevant tests are failing.

If you cannot run a test or validation step because of an environment limitation, missing dependency, unavailable service, permissions issue, or another external constraint, say so explicitly. State what you were able to test and what remains unverified. Never imply that a test passed if it was not actually run.

The standard for completion is: **implement the functionality, implement meaningful tests for it, run those tests, and verify that they pass.**
