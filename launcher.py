"""Tungsten Desk launcher — serves the dashboard and opens the browser.

Works three ways:
  1. As a frozen PyInstaller exe: serves bundled site files (or a live `site`
     folder placed next to the exe, which takes precedence so you can update
     data without rebuilding).
  2. As a plain script (python launcher.py): serves ./site.
  3. Double-click / run from anywhere; Ctrl+C stops the server.
"""
import os
import sys
import socket
import threading
import webbrowser
from functools import partial
from http.server import SimpleHTTPRequestHandler, ThreadingHTTPServer


def find_site_dir():
    if getattr(sys, "frozen", False):
        exe_dir = os.path.dirname(os.path.abspath(sys.executable))
        # Live data next to the exe wins over the bundled copy.
        live = os.path.join(exe_dir, "site")
        if os.path.isdir(live) and os.path.isfile(os.path.join(live, "index.html")):
            return live
        bundled = os.path.join(getattr(sys, "_MEIPASS", exe_dir), "site")
        if os.path.isdir(bundled):
            return bundled
        raise SystemExit("ERROR: bundled 'site' not found — rebuild the exe.")
    here = os.path.dirname(os.path.abspath(__file__))
    site = os.path.join(here, "site")
    if not os.path.isfile(os.path.join(site, "index.html")):
        raise SystemExit(f"ERROR: no site/index.html next to launcher (looked in {site})")
    return site


def pick_port(preferred=8787):
    for port in range(preferred, preferred + 25):
        with socket.socket(socket.AF_INET, socket.SOCK_STREAM) as s:
            try:
                s.bind(("127.0.0.1", port))
                return port
            except OSError:
                continue
    raise SystemExit("ERROR: no free port found")


class QuietHandler(SimpleHTTPRequestHandler):
    """Same static handler, minimal logging (startup + errors only)."""

    def log_message(self, fmt, *args):
        pass  # keep the console clean


def main():
    # Windows consoles may be cp1252 — make printing safe regardless of codepage.
    for stream in (sys.stdout, sys.stderr):
        try:
            stream.reconfigure(encoding="utf-8", errors="replace")
        except Exception:
            pass
    site_dir = find_site_dir()
    port = pick_port()
    handler = partial(QuietHandler, directory=site_dir)
    httpd = ThreadingHTTPServer(("127.0.0.1", port), handler)

    url = f"http://localhost:{port}"
    banner = f"""
  +-------------------------------------------------------+
  |  T U N G S T E N   D E S K                            |
  |  multi-model tungsten price intelligence              |
  +-------------------------------------------------------+
  |  serving:  {site_dir:<44}|
  |  open:     {url:<44}|
  |  stop:     press Ctrl+C                               |
  +-------------------------------------------------------+
"""
    print(banner)

    threading.Timer(0.8, lambda: webbrowser.open(url)).start()
    try:
        httpd.serve_forever()
    except KeyboardInterrupt:
        print("\n  Tungsten Desk stopped. Good bye.")
        httpd.server_close()


if __name__ == "__main__":
    main()
