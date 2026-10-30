// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

package samples

import (
	"crypto/sha256"
	"encoding/hex"
	"path/filepath"
	"strings"
)

// maxDirPrefix bounds the readable part of a directory name.
const maxDirPrefix = 64

// dirFor makes the directory of the store of a step. A name that is not kept
// as it is gets a hash of the name after a dot, which a kept name never has,
// so that two steps never share a store.
func dirFor(attemptDir, stepName string) string {
	safe := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		default:
			return '_'
		}
	}, stepName)
	if safe != stepName || len(safe) > maxDirPrefix {
		sum := sha256.Sum256([]byte(stepName))
		safe = safe[:min(len(safe), maxDirPrefix)] + "." + hex.EncodeToString(sum[:6])
	}
	return filepath.Join(attemptDir, "samples", safe)
}
