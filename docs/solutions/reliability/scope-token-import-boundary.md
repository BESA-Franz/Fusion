# Scope attribution import boundary

The scope auto-widen module imported a small task-id normalizer from the public merger facade. That reverse dependency loaded the full merger graph whenever scope attribution was imported, making a one-case real Git test spend more than twelve seconds in module transformation and import.

The normalizer now lives in a pure leaf module used by both ownership and scope attribution. The public merger export remains unchanged, while direct unit coverage fixes the normalization contract and the existing real Git fixture verifies attribution behavior. The ownership fixture also invokes Git with argv instead of POSIX shell quoting, so its complete contract runs on Windows.
