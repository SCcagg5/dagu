# Workspace demo workflows

Workflows that show the workflow workspace: a graph with outputs, a router, a slow step to test the reuse of earlier outputs, chains (one scheduled with two schedules), repeating steps, and two build workflows.

Run `./setup.sh <data-dir>` to copy them into a Dagu data directory. Start Dagu with `DAGU_HOME=<data-dir>`. The build workflows expect `<data-dir>/demo-build` and the working directory `/var/lib/dagu/demo-build` (the data directory of the container image).
