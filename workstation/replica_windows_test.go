package main

import "testing"

func TestProtectedWindowsReplica(t *testing.T) {
	testReplica(t, windowsCodec)
}
