import subprocess
import sys
import os
import signal
import time

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

def start_servers():
    for server in servers:
        print(f"Starting {server['name']}...")
        p = subprocess.Popen(
            ["start", "cmd", "/k"] + server["cmd"],
            shell=True
        )
        processes.append(p)
    print("All servers started.")

def stop_servers():
    print("Stopping all servers...")
    for p in processes:
        try:
            p.terminate()
        except Exception as e:
            print(f"Error stopping process: {e}")
    print("All servers stopped.")

if __name__ == "__main__":
    while True:
        cmd = input("Type 'start' to launch servers, 'stop' to kill them, 'restart' to restart, or 'exit' to quit: ").strip().lower()
        if cmd == "start":
            start_servers()
        elif cmd == "stop":
            stop_servers()
        elif cmd == "restart":
            stop_servers()
            time.sleep(2)
            start_servers()
        elif cmd == "exit":
            stop_servers()
            break
        else:
            print("Unknown command.")
