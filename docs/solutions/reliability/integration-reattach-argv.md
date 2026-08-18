# Integration branch reattach argv

Detached-HEAD recovery reattached an authoritative task branch through interpolated `git checkout` shell text. Canonical branch generation lowercases task ids but does not remove shell-significant characters, so a valid ref could be altered before reaching Git.

The checkout now receives the canonical branch as an argv element. The existing authoritative-reattach contract additionally asserts that exact child-process argument boundary.
