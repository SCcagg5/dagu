// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

package persis_test

import (
	"context"
	"path/filepath"
	"testing"
	"time"

	"github.com/dagucloud/dagu/v2/internal/dagrun"
	"github.com/dagucloud/dagu/v2/internal/ir"
	"github.com/dagucloud/dagu/v2/internal/persis"
	"github.com/dagucloud/dagu/v2/internal/spec"
	"github.com/dagucloud/dagu/v2/internal/testutil"
	"github.com/stretchr/testify/require"
)

func newEphemeralTestRepository(t *testing.T, now func() time.Time) *persis.DAGRunRepository {
	t.Helper()
	root := t.TempDir()
	return testutil.NewFileDAGRunRepositoryWithEphemeral(
		filepath.Join(root, "dag-runs"),
		filepath.Join(root, "dag-runs-ephemeral"),
		persis.DAGRunRepositoryOptions{Now: now},
	)
}

func writeTestRun(t *testing.T, repo *persis.DAGRunRepository, dag *ir.DAG, runID string, status ir.Status, finished time.Time, ephemeral bool) {
	t.Helper()
	ctx := context.Background()
	attempt, err := repo.CreateAttempt(ctx, dag, time.Now(), runID, persis.DAGRunCreateAttemptOptions{Ephemeral: ephemeral})
	require.NoError(t, err)
	opts := []ir.StatusOption{ir.WithAttemptID(attempt.ID()), ir.WithEphemeral(ephemeral)}
	if !finished.IsZero() {
		opts = append(opts, ir.WithFinishedAt(finished))
	}
	require.NoError(t, attempt.Open(ctx))
	require.NoError(t, attempt.Write(ctx, ir.NewStatusBuilder(dag).Create(runID, status, 0, time.Now(), opts...)))
	require.NoError(t, attempt.Close(ctx))
}

// An ephemeral run is found by its ID but reaches no listing, no latest
// lookup and no retention pass.
func TestEphemeralRunIsReadableButUnlisted(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	dag, err := spec.LoadYAML(ctx, []byte("name: eph\nsteps:\n  - run: echo hi\n"))
	require.NoError(t, err)
	repo := newEphemeralTestRepository(t, nil)

	writeTestRun(t, repo, dag, "normal", ir.Succeeded, time.Now(), false)
	writeTestRun(t, repo, dag, "ephemeral", ir.Succeeded, time.Now(), true)

	attempt, err := repo.FindAttempt(ctx, ir.NewDAGRunRef(dag.Name, "ephemeral"))
	require.NoError(t, err)
	status, err := attempt.ReadStatus(ctx)
	require.NoError(t, err)
	require.True(t, status.Ephemeral)

	listed, err := repo.ListStatuses(ctx, persis.DAGRunListOptions{AllHistory: true, Unbounded: true})
	require.NoError(t, err)
	require.Len(t, listed, 1)
	require.Equal(t, "normal", listed[0].DAGRunID)

	latest, err := repo.LatestAttempt(ctx, dag.Name, persis.DAGRunLatestAttemptOptions{AllHistory: true})
	require.NoError(t, err)
	latestStatus, err := latest.ReadStatus(ctx)
	require.NoError(t, err)
	require.Equal(t, "normal", latestStatus.DAGRunID)

	recent, err := repo.RecentStatuses(ctx, dag.Name, 10)
	require.NoError(t, err)
	require.Len(t, recent, 1)

	// Retention keeps the one normal run: the ephemeral run is neither counted
	// nor removed.
	keep := 1
	removed, err := repo.RemoveOldDAGRuns(ctx, dag.Name, 0, persis.DAGRunRetentionOptions{RetentionRuns: &keep})
	require.NoError(t, err)
	require.Empty(t, removed)
	_, err = repo.FindAttempt(ctx, ir.NewDAGRunRef(dag.Name, "ephemeral"))
	require.NoError(t, err)
}

// A retry attempt and a child run of an ephemeral run stay in the ephemeral
// store, so they stay out of the history too.
func TestEphemeralRunAttemptsFollowTheRoot(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	dag, err := spec.LoadYAML(ctx, []byte("name: eph\nsteps:\n  - run: echo hi\n"))
	require.NoError(t, err)
	repo := newEphemeralTestRepository(t, nil)
	writeTestRun(t, repo, dag, "root", ir.Failed, time.Now(), true)
	root := ir.NewDAGRunRef(dag.Name, "root")

	retry, err := repo.CreateAttempt(ctx, dag, time.Now(), "root", persis.DAGRunCreateAttemptOptions{Retry: true})
	require.NoError(t, err)
	require.NoError(t, retry.Open(ctx))
	require.NoError(t, retry.Write(ctx, ir.NewStatusBuilder(dag).Create("root", ir.Succeeded, 0, time.Now(),
		ir.WithAttemptID(retry.ID()), ir.WithEphemeral(true), ir.WithFinishedAt(time.Now()))))
	require.NoError(t, retry.Close(ctx))

	child, err := repo.CreateAttempt(ctx, dag, time.Now(), "child", persis.DAGRunCreateAttemptOptions{RootDAGRun: root})
	require.NoError(t, err)
	require.NoError(t, child.Open(ctx))
	require.NoError(t, child.Write(ctx, ir.NewStatusBuilder(dag).Create("child", ir.Succeeded, 0, time.Now(),
		ir.WithAttemptID(child.ID()), ir.WithHierarchyRefs(root, root))))
	require.NoError(t, child.Close(ctx))

	_, err = repo.FindSubAttempt(ctx, root, "child")
	require.NoError(t, err)
	listed, err := repo.ListStatuses(ctx, persis.DAGRunListOptions{AllHistory: true, Unbounded: true})
	require.NoError(t, err)
	require.Empty(t, listed)
}

// The cleanup removes an ephemeral run once it has ended for the TTL, and
// never removes a run that has not ended.
func TestRemoveEndedEphemeralRuns(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	dag, err := spec.LoadYAML(ctx, []byte("name: eph\nsteps:\n  - run: echo hi\n"))
	require.NoError(t, err)
	now := time.Now()
	repo := newEphemeralTestRepository(t, func() time.Time { return now })

	writeTestRun(t, repo, dag, "old", ir.Succeeded, now.Add(-persis.EphemeralRunTTL-time.Minute), true)
	writeTestRun(t, repo, dag, "recent", ir.Succeeded, now.Add(-time.Minute), true)
	writeTestRun(t, repo, dag, "running", ir.Running, time.Time{}, true)
	writeTestRun(t, repo, dag, "history", ir.Succeeded, now.Add(-24*time.Hour), false)

	removed, err := repo.RemoveEndedEphemeralRuns(ctx, persis.EphemeralRunTTL)
	require.NoError(t, err)
	require.Equal(t, 1, removed)
	_, err = repo.FindAttempt(ctx, ir.NewDAGRunRef(dag.Name, "old"))
	require.ErrorIs(t, err, dagrun.ErrDAGRunIDNotFound)
	for _, id := range []string{"recent", "running", "history"} {
		_, err = repo.FindAttempt(ctx, ir.NewDAGRunRef(dag.Name, id))
		require.NoError(t, err, id)
	}

	// A zero TTL, as used at server start, removes every ended run but still
	// spares the active one and the history.
	removed, err = repo.RemoveEndedEphemeralRuns(ctx, 0)
	require.NoError(t, err)
	require.Equal(t, 1, removed)
	_, err = repo.FindAttempt(ctx, ir.NewDAGRunRef(dag.Name, "running"))
	require.NoError(t, err)
	_, err = repo.FindAttempt(ctx, ir.NewDAGRunRef(dag.Name, "history"))
	require.NoError(t, err)
}

// The history of a DAG lists ephemeral runs only on request, merged with the
// other runs by start time, newest first, under one limit.
func TestRecentStatusesWithEphemeralRuns(t *testing.T) {
	t.Parallel()

	ctx := context.Background()
	dag, err := spec.LoadYAML(ctx, []byte("name: eph\nsteps:\n  - run: echo hi\n"))
	require.NoError(t, err)
	repo := newEphemeralTestRepository(t, nil)

	base := time.Now().Add(-time.Hour).Truncate(time.Second)
	write := func(runID string, offset time.Duration, ephemeral bool) {
		start := base.Add(offset)
		attempt, err := repo.CreateAttempt(ctx, dag, start, runID, persis.DAGRunCreateAttemptOptions{Ephemeral: ephemeral})
		require.NoError(t, err)
		status := ir.NewStatusBuilder(dag).Create(runID, ir.Succeeded, 0, start,
			ir.WithAttemptID(attempt.ID()), ir.WithEphemeral(ephemeral), ir.WithFinishedAt(start.Add(time.Second)))
		require.NoError(t, attempt.Open(ctx))
		require.NoError(t, attempt.Write(ctx, status))
		require.NoError(t, attempt.Close(ctx))
	}
	write("n1", 0, false)
	write("e1", time.Minute, true)
	write("n2", 2*time.Minute, false)
	write("e2", 3*time.Minute, true)

	ids := func(limit int, includeEphemeral bool) []string {
		statuses, err := repo.RecentStatusesWithOptions(ctx, dag.Name, limit, persis.RecentStatusesOptions{IncludeEphemeral: includeEphemeral})
		require.NoError(t, err)
		var out []string
		for _, status := range statuses {
			out = append(out, status.DAGRunID)
		}
		return out
	}

	require.Equal(t, []string{"n2", "n1"}, ids(10, false))
	require.Equal(t, []string{"e2", "n2", "e1", "n1"}, ids(10, true))
	require.Equal(t, []string{"e2", "n2", "e1"}, ids(3, true))
}
