#!/usr/bin/env python3
"""Guarded disposable local HTTP preview; never reads hosted environment files.
Start once; use status to discover ports/processes, serve to resume a stopped
preview against its existing disposable DB. All actions remain local-only.
"""
import os
from pathlib import Path
import sys

helper = Path(__file__).with_name("local-event-http.py")
os.execv(sys.executable, [sys.executable, str(helper), *(sys.argv[1:] or ["start"])])
