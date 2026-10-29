# Evidence strategy

Each slice names a strategy, independent oracle, plausible wrong implementation, cheapest sufficient
layer, expected command or observation, and residual risk.

| Strategy                   | Use when                                                                     | Minimum proof                                                             |
| -------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| `regression-first`         | A defect has a stable, cheap seam.                                           | The signal fails before the correction and rejects a plausible wrong fix. |
| `existing-contract`        | Existing tests, types, fixtures, builds, or checks fully observe the change. | Name the owner and the wrong implementation it catches.                   |
| `implementation-then-test` | Exploration must establish the stable seam first.                            | Observe the behavior, then add only the durable missing signal.           |
| `runtime/e2e`              | The contract crosses Electron processes or a full journey.                   | Controlled runtime observation of the material journey.                   |
| `static/build`             | The contract is type, config, packaging, docs, or generated output.          | Owning validator plus artifact inspection when needed.                    |
| `manual/visual`            | Fidelity, interaction, or accessibility judgment matters.                    | Named state/input checks and recorded observations.                       |
| `none`                     | No proportionate durable signal exists.                                      | Written reason and residual risk.                                         |

Do not count a newly authored test as independent proof by itself. Name the external contract,
existing fixture, prior failure, or runtime observation that gives the test meaning. Use `test-create`
when a test is actually needed.
