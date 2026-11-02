"""Stamp a release: writes js/version.js (shown in Library -> Backup) and VERSION in sw.js, so every device
installs the new service worker and reloads with every file from the same release. Run before committing:
    py -3 tools/stamp_release.py
"""
import datetime, io, os, re
root = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
now = datetime.datetime.now()
stamp, ver = now.strftime("%Y-%m-%d %H:%M"), now.strftime("%Y%m%d%H%M")
io.open(os.path.join(root, "js", "version.js"), "w", encoding="utf-8", newline="\n").write(
    "window.ChronoVersion = '%s'; // written by tools/stamp_release.py\n" % stamp)
p = os.path.join(root, "sw.js")
s = io.open(p, encoding="utf-8").read()
s = re.sub(r"^const VERSION = .*$", "const VERSION = 'chronomap-%s';" % ver, s, count=1, flags=re.M)
io.open(p, "w", encoding="utf-8", newline="\n").write(s)
print("stamped", stamp)
