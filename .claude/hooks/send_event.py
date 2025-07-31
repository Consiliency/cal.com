#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.8"
# dependencies = [
#     "anthropic",
#     "python-dotenv",
# ]
# ///

"""
Multi-Agent Observability Hook Script
Sends Claude Code hook events to the observability server.
"""

import json
import sys
import os
import argparse
import urllib.request
import urllib.error
from datetime import datetime

# Add logging to a file to track what's happening
def log_debug(message):
    """Log debug messages to a file."""
    try:
        with open("/tmp/claude_hooks_debug.log", "a") as f:
            timestamp = datetime.now().strftime("%Y-%m-%d %H:%M:%S.%f")[:-3]
            f.write(f"[{timestamp}] {message}\n")
            f.flush()
    except:
        pass  # Don't fail if logging fails

def send_event_to_server(event_data, server_url='http://localhost:4000/events'):
    """Send event data to the observability server."""
    try:
        # Prepare the request
        req = urllib.request.Request(
            server_url,
            data=json.dumps(event_data).encode('utf-8'),
            headers={
                'Content-Type': 'application/json',
                'User-Agent': 'Claude-Code-Hook/1.0'
            }
        )
        
        # Send the request with a very short timeout
        with urllib.request.urlopen(req, timeout=2) as response:
            return response.status == 200
                
    except Exception as e:
        log_debug(f"Error sending event: {type(e).__name__}: {str(e)}")
        return False

def main():
    try:
        # Parse command line arguments
        parser = argparse.ArgumentParser(description='Send Claude Code hook events to observability server')
        parser.add_argument('--source-app', required=True, help='Source application name')
        parser.add_argument('--event-type', required=True, help='Hook event type')
        parser.add_argument('--server-url', default='http://localhost:4000/events', help='Server URL')
        parser.add_argument('--add-chat', action='store_true', help='Include chat transcript if available')
        parser.add_argument('--summarize', action='store_true', help='Generate summary of the event')
        
        args = parser.parse_args()
        
        # Read hook data from stdin
        try:
            input_data = json.load(sys.stdin)
        except Exception as e:
            log_debug(f"Failed to parse JSON input: {e}")
            # Exit cleanly to avoid breaking the tool protocol
            sys.exit(0)
        
        # Prepare event data for server
        event_data = {
            'source_app': args.source_app,
            'session_id': input_data.get('session_id', 'unknown'),
            'hook_event_type': args.event_type,
            'payload': input_data,
            'timestamp': int(datetime.now().timestamp() * 1000)
        }
        
        # Handle --add-chat option
        if args.add_chat and 'transcript_path' in input_data:
            transcript_path = input_data['transcript_path']
            if os.path.exists(transcript_path):
                try:
                    with open(transcript_path, 'r') as f:
                        chat_data = []
                        for line in f:
                            line = line.strip()
                            if line:
                                try:
                                    chat_data.append(json.loads(line))
                                except:
                                    pass
                    
                    if chat_data:
                        event_data['chat'] = chat_data
                except Exception as e:
                    log_debug(f"Error reading transcript: {e}")
        
        # Send to server silently
        success = send_event_to_server(event_data, args.server_url)
        if not success:
            log_debug(f"Failed to send {args.event_type} event to server")
        
        # Always exit with 0
        sys.exit(0)
        
    except Exception as e:
        log_debug(f"Unexpected error in send_event: {type(e).__name__}: {str(e)}")
        # Always exit with 0 to avoid breaking the tool protocol
        sys.exit(0)

if __name__ == '__main__':
    main()