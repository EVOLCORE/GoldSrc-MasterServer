#!/bin/bash

# GoldSrc Master Server Management Script
# Usage: ./manage.sh {start|stop|restart|status|logs}

PID_FILE="master.pid"
LOG_FILE="master.log"
SERVER_SCRIPT="dist/server.js"

# Check if node is installed
if ! command -v node &> /dev/null; then
    echo "Error: 'node' is not installed or not in PATH."
    exit 1
fi

# Check if server is built
if [ ! -f "$SERVER_SCRIPT" ]; then
    echo "Error: Server not built. Run 'npm run build' first."
    exit 1
fi

start_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "Server is already running (PID: $PID)"
            return
        else
            echo "Found stale PID file. Removed."
            rm "$PID_FILE"
        fi
    fi

    echo "Starting GoldSrc Master Server..."
    nohup node "$SERVER_SCRIPT" >> "$LOG_FILE" 2>&1 &
    NEW_PID=$!
    echo "$NEW_PID" > "$PID_FILE"
    echo "Server started successfully (PID: $NEW_PID)"
    echo "Logs are being written to $LOG_FILE"
}

stop_server() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        echo "Stopping server (PID: $PID)..."
        kill "$PID" 2>/dev/null
        rm "$PID_FILE"
        echo "Server stopped."
    else
        echo "Server is not running (no PID file found)."
    fi
}

server_status() {
    if [ -f "$PID_FILE" ]; then
        PID=$(cat "$PID_FILE")
        if ps -p "$PID" > /dev/null 2>&1; then
            echo "✅ Server is RUNNING (PID: $PID)"
            echo "   Uptime: $(ps -p "$PID" -o etime= | tr -d ' ')"
        else
            echo "❌ Server is NOT RUNNING (Stale PID file found)"
        fi
    else
        echo "❌ Server is NOT RUNNING"
    fi
}

view_logs() {
    echo "Tailing logs (Ctrl+C to exit)..."
    tail -f "$LOG_FILE"
}

case "$1" in
    start)
        start_server
        ;;
    stop)
        stop_server
        ;;
    restart)
        stop_server
        sleep 1
        start_server
        ;;
    status)
        server_status
        ;;
    logs)
        view_logs
        ;;
    *)
        echo "Usage: ./manage.sh {start|stop|restart|status|logs}"
        exit 1
        ;;
esac
