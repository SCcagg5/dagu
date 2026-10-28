// Copyright (C) 2026 Yota Hamada
// SPDX-License-Identifier: GPL-3.0-or-later

package samples

import (
	"path/filepath"
	"strings"
)

// dirFor makes the directory of the store of a step.
func dirFor(attemptDir, stepName string) string {
	safe := strings.Map(func(r rune) rune {
		switch {
		case r >= 'a' && r <= 'z', r >= 'A' && r <= 'Z', r >= '0' && r <= '9', r == '-', r == '_':
			return r
		default:
			return '_'
		}
	}, stepName)
	return filepath.Join(attemptDir, "samples", safe)
}
