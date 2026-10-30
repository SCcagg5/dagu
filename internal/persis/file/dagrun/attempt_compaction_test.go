// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

package dagrun

import (
	"context"
	"os"
	"path/filepath"
	"strings"
	"sync"
	"testing"

	"github.com/dagucloud/dagu/v2/internal/ir"
	"github.com/stretchr/testify/assert"
	"github.com/stretchr/testify/require"
)

// A run that repeats a step without a limit appends a status for a long time.
// The file stays small and keeps the last record. Each write syncs the file,
// so the test appends records of 16 KiB: 1 500 of them are 24 MiB.
func TestAttempt_WriteBoundsFileSize(t *testing.T) {
	dir := createTempDir(t)
	file := filepath.Join(dir, "status.dat")
	ctx := context.Background()

	att, err := NewAttempt(file, nil)
	require.NoError(t, err)
	require.NoError(t, att.Open(ctx))
	defer func() { _ = att.Close(ctx) }()

	const writes = 1_500
	pad := strings.Repeat("x", 16<<10)
	var largest int64
	for i := 1; i <= writes; i++ {
		st := createTestStatus(ir.Running)
		st.PID = ir.PID(i)
		st.Nodes[0].Error = pad
		require.NoError(t, att.Write(ctx, st))
		if i%20 == 0 {
			info, err := os.Stat(file)
			require.NoError(t, err)
			largest = max(largest, info.Size())
		}
	}

	info, err := os.Stat(file)
	require.NoError(t, err)
	largest = max(largest, info.Size())
	assert.Less(t, largest, int64(2<<20))

	status, err := ParseStatusFile(file)
	require.NoError(t, err)
	assert.Equal(t, ir.PID(writes), status.PID)

	// The writer is still usable and the temporary files are gone.
	require.NoError(t, att.Write(ctx, createTestStatus(ir.Succeeded)))
	status, err = ParseStatusFile(file)
	require.NoError(t, err)
	assert.Equal(t, ir.Succeeded, status.Status)
	entries, err := os.ReadDir(dir)
	require.NoError(t, err)
	for _, e := range entries {
		assert.False(t, strings.HasSuffix(e.Name(), ".tmp"), e.Name())
	}
}

// A reader that opens the file during the replacements sees whole records
// and never goes back to an older one.
func TestAttempt_CompactionKeepsReadersWhole(t *testing.T) {
	dir := createTempDir(t)
	file := filepath.Join(dir, "status.dat")
	ctx := context.Background()

	att, err := NewAttempt(file, nil)
	require.NoError(t, err)
	require.NoError(t, att.Open(ctx))
	defer func() { _ = att.Close(ctx) }()

	// Big records make the file cross the limit often.
	pad := strings.Repeat("x", 64<<10)
	const writes = 600
	first := createTestStatus(ir.Running)
	first.PID = 0
	require.NoError(t, att.Write(ctx, first))

	var wg sync.WaitGroup
	stop := make(chan struct{})
	readErr := make(chan error, 1)
	wg.Go(func() {
		last := ir.PID(0)
		for {
			select {
			case <-stop:
				return
			default:
			}
			st, err := ParseStatusFile(file)
			if err != nil {
				readErr <- err
				return
			}
			if st.PID < last {
				readErr <- assert.AnError
				return
			}
			last = st.PID
		}
	})

	for i := 1; i <= writes; i++ {
		st := createTestStatus(ir.Running)
		st.PID = ir.PID(i)
		st.Nodes[0].Error = pad
		require.NoError(t, att.Write(ctx, st))
	}
	close(stop)
	wg.Wait()

	select {
	case err := <-readErr:
		t.Fatalf("reader failed: %v", err)
	default:
	}
	info, err := os.Stat(file)
	require.NoError(t, err)
	assert.Less(t, info.Size(), int64(statusFileMaxSize+4*(64<<10)))
}

// A record larger than the limit is not compacted at each write.
func TestAttempt_CompactionSkipsSingleBigRecord(t *testing.T) {
	dir := createTempDir(t)
	file := filepath.Join(dir, "status.dat")
	ctx := context.Background()

	att, err := NewAttempt(file, nil)
	require.NoError(t, err)
	require.NoError(t, att.Open(ctx))
	defer func() { _ = att.Close(ctx) }()

	big := createTestStatus(ir.Running)
	big.Nodes[0].Error = strings.Repeat("y", statusFileMaxSize+1)
	require.NoError(t, att.Write(ctx, big))
	assert.Equal(t, 1, att.appended)
	require.NoError(t, att.Write(ctx, big))
	assert.Equal(t, 0, att.appended, "the second write compacts")
	require.NoError(t, att.Write(ctx, big))
	assert.Equal(t, 1, att.appended)
}

// A writer that could not open again after a compaction opens on the next
// write, so the later statuses of the run are still kept.
func TestAttempt_WriteReopensClosedWriter(t *testing.T) {
	dir := createTempDir(t)
	file := filepath.Join(dir, "status.dat")
	ctx := context.Background()

	att, err := NewAttempt(file, nil)
	require.NoError(t, err)
	require.NoError(t, att.Open(ctx))
	defer func() { _ = att.Close(ctx) }()
	require.NoError(t, att.Write(ctx, createTestStatus(ir.Running)))

	// The state that a failed reopen leaves: the writer is set but closed.
	require.NoError(t, att.writer.close())

	require.NoError(t, att.Write(ctx, createTestStatus(ir.Succeeded)))
	status, err := ParseStatusFile(file)
	require.NoError(t, err)
	assert.Equal(t, ir.Succeeded, status.Status)
}
