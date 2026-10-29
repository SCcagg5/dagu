// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

package api

import (
	"context"
	"fmt"
	"net/http"
	"net/url"
	"strconv"
	"time"

	"github.com/dagucloud/dagu/v2/api/v1"
	"github.com/dagucloud/dagu/v2/internal/cmn/stringutil"
	"github.com/dagucloud/dagu/v2/internal/ir"
)

const (
	minActivityWindow = time.Minute
	maxActivityWindow = 7 * 24 * time.Hour
	// activityRunLimit bounds the runs that the activity of one DAG lists.
	activityRunLimit = 60
)

// activityWindowFromSeconds checks the activityWindow parameter of a list.
func activityWindowFromSeconds(seconds int) (time.Duration, error) {
	window := time.Duration(seconds) * time.Second
	if window < minActivityWindow || window > maxActivityWindow {
		return 0, &Error{
			HTTPStatus: http.StatusBadRequest,
			Code:       api.ErrorCodeBadRequest,
			Message: fmt.Sprintf("activityWindow must be from %d to %d seconds, got %d",
				int(minActivityWindow.Seconds()), int(maxActivityWindow.Seconds()), seconds),
		}
	}
	return window, nil
}

// activityWindowFromQuery reads activityWindow from the query string of an
// SSE list. It returns 0 when the parameter is absent.
func activityWindowFromQuery(params url.Values) (time.Duration, error) {
	raw := params.Get("activityWindow")
	if raw == "" {
		return 0, nil
	}
	seconds, err := strconv.Atoi(raw)
	if err != nil {
		return 0, &Error{
			HTTPStatus: http.StatusBadRequest,
			Code:       api.ErrorCodeBadRequest,
			Message:    fmt.Sprintf("activityWindow must be an integer, got %q", raw),
		}
	}
	return activityWindowFromSeconds(seconds)
}

// dagActivity lists the runs of a DAG that started since `since`, newest
// first. It first looks at the newest run: when that run started before the
// window, no run is in the window and no more history is read, so a DAG that
// has not run for years costs one directory walk. `latest` is the latest
// status that the list already read; it may be empty when the server keeps
// only the runs of today.
func (a *API) dagActivity(ctx context.Context, dag *ir.DAG, latest ir.DAGRunStatus, since time.Time) (*api.DAGListActivity, error) {
	activity := &api.DAGListActivity{Runs: []api.DAGListActivityRun{}}
	newest := latest
	if newest.DAGRunID == "" {
		probe, err := a.dagRunRepository.RecentStatuses(ctx, dag.Name, 1)
		if err != nil {
			return activity, fmt.Errorf("list recent runs of %s: %w", dag.Name, err)
		}
		if len(probe) == 0 {
			return activity, nil
		}
		newest = probe[0]
	}
	if !inActivityWindow(newest, since) {
		return activity, nil
	}
	statuses, err := a.dagRunRepository.RecentStatuses(ctx, dag.Name, activityRunLimit+1)
	if err != nil {
		return activity, fmt.Errorf("list recent runs of %s: %w", dag.Name, err)
	}
	for _, status := range statuses {
		// The runs come newest first: the first run before the window ends the list.
		if !inActivityWindow(status, since) {
			break
		}
		if len(activity.Runs) == activityRunLimit {
			activity.Truncated = true
			break
		}
		activity.Runs = append(activity.Runs, toListActivityRun(status))
	}
	return activity, nil
}

// inActivityWindow reports whether a run started since `since`. A run that
// still runs counts whenever it has started.
func inActivityWindow(status ir.DAGRunStatus, since time.Time) bool {
	started := runTime(status.StartedAt)
	if started.IsZero() {
		return false
	}
	return status.Status.IsActive() || !started.Before(since)
}

func toListActivityRun(status ir.DAGRunStatus) api.DAGListActivityRun {
	run := api.DAGListActivityRun{
		DagRunId:  status.DAGRunID,
		Status:    api.Status(status.Status),
		StartedAt: status.StartedAt,
	}
	if !runTime(status.FinishedAt).IsZero() {
		run.FinishedAt = ptrOf(status.FinishedAt)
	}
	if cached, ok := reusedTimeMs(status.ReusedInputs); ok {
		run.CachedMs = ptrOf(cached)
	}
	return run
}

// reusedTimeMs sums the times that the reused steps of a run took in their
// source runs, as the timeline of the workspace does. It reports false when
// no reused step has a known time.
func reusedTimeMs(inputs []ir.ReusedInput) (int64, bool) {
	var sum int64
	known := false
	for _, input := range inputs {
		started, finished := runTime(input.StartedAt), runTime(input.FinishedAt)
		if started.IsZero() || finished.IsZero() || finished.Before(started) {
			continue
		}
		sum += finished.Sub(started).Milliseconds()
		known = true
	}
	return sum, known
}

// runTime parses a run timestamp; the zero time stands for an empty or
// unreadable value.
func runTime(value string) time.Time {
	t, err := stringutil.ParseTime(value)
	if err != nil {
		return time.Time{}
	}
	return t
}
