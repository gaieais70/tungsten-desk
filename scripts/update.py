"""Tungsten Desk — Master Automated Update Pipeline.

Runs the complete refresh sequence in a single command:
  1. harvest_market.py: Updates Yahoo Finance daily closes (metals, FX, indices, pure-play equities).
  2. harvest_ctia.py: Checks CTIA / Chinatungsten Online for newly published price reports.
  3. build_observations.py: Ingests verified price quotes into data/observations.csv.
  4. models.py: Recomputes M0, M1, M2, M3, M4, M5, correlation matrix, and generates site/data/models_output.json.
  5. extract_news.py: Curates the latest news feed into site/data/news.json.

Usage:
  python scripts/update.py
  (or double click update.bat in root directory)
"""
import sys
import subprocess
import time
from datetime import datetime
from pathlib import Path

# Safe encoding for Windows consoles
for stream in (sys.stdout, sys.stderr):
    try:
        stream.reconfigure(encoding='utf-8', errors='replace')
    except Exception:
        pass

ROOT = Path(__file__).resolve().parent.parent

def run_step(step_name, cmd):
    print(f"\n=======================================================")
    print(f">> STEP: {step_name}")
    print(f"=======================================================")
    t0 = time.time()
    res = subprocess.run([sys.executable] + cmd, cwd=ROOT)
    elapsed = time.time() - t0
    if res.returncode != 0:
        print(f"[FAILED] {step_name} exited with code {res.returncode} in {elapsed:.1f}s")
        return False
    print(f"[OK] {step_name} completed in {elapsed:.1f}s")
    return True

def main():
    start_time = datetime.now()
    print(f"Starting Tungsten Desk Refresh Pipeline at {start_time.strftime('%Y-%m-%d %H:%M:%S')}")
    
    steps = [
        ("Harvesting Market Data (Yahoo Finance)", ["scripts/harvest_market.py"]),
        ("Harvesting Industry Reports (CTIA / Chinatungsten)", ["scripts/harvest_ctia.py", "--since", "2025-01-01"]),
        ("Compiling Observations Database", ["scripts/build_observations.py"]),
        ("Solving Pricing Models Engine (M0-M5)", ["scripts/models.py"]),
        ("Curating Industry News & Events Feed", ["scripts/extract_news.py"]),
    ]
    
    all_ok = True
    for name, cmd in steps:
        if not run_step(name, cmd):
            all_ok = False
            break
            
    total_elapsed = (datetime.now() - start_time).total_seconds()
    print(f"\n=======================================================")
    if all_ok:
        print(f"ALL STEPS COMPLETED SUCCESSFULLY in {total_elapsed:.1f}s!")
        print("Dashboard data is fully updated and ready to view.")
        print(f"Run 'start.bat' or visit http://localhost:8787")
    else:
        print(f"Pipeline completed with errors in {total_elapsed:.1f}s.")
    print(f"=======================================================\n")
    return 0 if all_ok else 1

if __name__ == '__main__':
    sys.exit(main())
