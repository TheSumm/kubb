<!-- Based on Bun's template -->

name: 🐛 Bug Report
description: Report an issue that should be fixed
labels: [bug]
body:
  - type: markdown
    attributes:
      value: |
        Thank you for submitting a bug report. It helps make `Kubb` better.
  - type: input
    attributes:
      label: What version of `kubb` is running?
      description: Copy the output of `kubb -v`
  - type: input
    attributes:
      label: What platform is your computer?
      description: MacOS, Windows, Linux.
  - type: textarea
    attributes:
      label: What steps can reproduce the bug?
      description: Explain the bug and provide a code snippet that can reproduce it.
    validations:
      required: true
  - type: textarea
    attributes:
      label: What is the expected behavior?
      description: If possible, please provide text instead of a screenshot.
  - type: textarea
    attributes:
      label: What do you see instead?
      description: If possible, please provide text instead of a screenshot.
  - type: textarea
    attributes:
      label: Additional information
      description: Is there anything else you think we should know?