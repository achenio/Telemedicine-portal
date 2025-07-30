import subprocess
import sys
import os

servers = [
    {
        "name": "server.js",
        "cmd": ["node", "server.js"]
    },
    {
        "name": "server_ws.cjs",
        "cmd": ["node", "server_ws.cjs"]
    },
    {
        "name": "servervideo.cjs",
        "cmd": ["node", "servervideo.cjs"]
    },
    {
        "name": "serverbot.cjs",
        "cmd": ["node", "serverbot.cjs"]
    },
    {
        "name": "server-post.cjs",
        "cmd": ["node", "server-post.cjs"]
    },
    {
        "name": "payments.py",
        "cmd": [sys.executable, "payments.py"]
    },
    {
        "name": "decrypt.py",
        "cmd": [sys.executable, "decrypt.py"]
    }
]

processes = []
try:
    for server in servers:
        print(f"Starting {server['name']}...")
        p = subprocess.Popen(
            ["start", "cmd", "/k"] + server["cmd"],
            shell=True
        )
        processes.append(p)
    print("All servers started.")
except Exception as e:
    print(f"Error starting servers: {e}")
