#!/usr/bin/env -S uv run --script
# /// script
# requires-python = ">=3.11"
# dependencies = [
#     "python-dotenv",
# ]
# ///

import argparse
import json
import os
import sys
import random
import traceback
from pathlib import Path
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

try:
    from utils.constants import ensure_session_log_dir
except ImportError:
    # Fallback if utils module is not available
    def ensure_session_log_dir(session_id):
        """Fallback function to ensure session log directory exists."""
        try:
            log_dir = Path("logs") / session_id
            log_dir.mkdir(parents=True, exist_ok=True)
            return log_dir
        except Exception:
            return Path("logs") / "unknown"

try:
    from dotenv import load_dotenv
    load_dotenv()
except ImportError:
    pass  # dotenv is optional


def get_completion_messages():
    """Return list of friendly completion messages."""
    return [
        "Work complete!",
        "All done!",
        "Task finished!",
        "Job complete!",
        "Ready for next task!",
    ]


def get_simple_completion_message():
    """
    Generate a simple completion message without external dependencies.
    Returns a random predefined message.
    """
    try:
        messages = get_completion_messages()
        return random.choice(messages)
    except Exception as e:
        log_debug(f"Warning: Failed to get completion message: {e}")
        return "Work complete!"


def announce_completion():
    """Announce completion using simple console output."""
    try:
        # Get completion message
        completion_message = get_simple_completion_message()
        
        # Simple console announcement (no TTS to avoid external dependencies)
        print(f"🎉 {completion_message}", file=sys.stderr)
        
    except Exception as e:
        # Log but don't crash
        log_debug(f"Warning: Completion announcement failed: {e}")


def main():
    try:
        # Parse command line arguments
        parser = argparse.ArgumentParser()
        parser.add_argument(
            "--chat", action="store_true", help="Copy transcript to chat.json"
        )
        args = parser.parse_args()

        # Read JSON input from stdin
        try:
            input_data = json.load(sys.stdin)
        except json.JSONDecodeError as e:
            log_debug(f"Warning: Failed to parse JSON input: {e}")
            # Exit cleanly to avoid breaking the tool protocol
            sys.exit(0)

        # Extract required fields
        session_id = input_data.get("session_id", "")
        stop_hook_active = input_data.get("stop_hook_active", False)

        # Ensure session log directory exists
        try:
            log_dir = ensure_session_log_dir(session_id)
            log_path = log_dir / "stop.json"

            # Read existing log data or initialize empty list
            if log_path.exists():
                with open(log_path, "r") as f:
                    try:
                        log_data = json.load(f)
                    except (json.JSONDecodeError, ValueError):
                        log_data = []
            else:
                log_data = []

            # Append new data
            log_data.append(input_data)

            # Write back to file with formatting
            with open(log_path, "w") as f:
                json.dump(log_data, f, indent=2)
        except Exception as e:
            log_debug(f"Warning: Failed to log stop data: {e}")

        # Handle --chat switch
        if args.chat and "transcript_path" in input_data:
            transcript_path = input_data["transcript_path"]
            if os.path.exists(transcript_path):
                # Read .jsonl file and convert to JSON array
                chat_data = []
                try:
                    with open(transcript_path, "r") as f:
                        for line in f:
                            line = line.strip()
                            if line:
                                try:
                                    chat_data.append(json.loads(line))
                                except json.JSONDecodeError:
                                    pass  # Skip invalid lines

                    # Write to logs/chat.json
                    chat_file = os.path.join(log_dir, "chat.json")
                    with open(chat_file, "w") as f:
                        json.dump(chat_data, f, indent=2)
                except Exception as e:
                    log_debug(f"Warning: Failed to copy chat transcript: {e}")

        # Announce completion via simple console output
        announce_completion()

        sys.exit(0)

    except Exception as e:
        # Handle any other errors gracefully
        log_debug(f"Warning: Unexpected error in stop hook: {e}")
        log_debug(f"Traceback: {traceback.format_exc()}")
        # Always exit with 0 to avoid breaking the tool protocol
        sys.exit(0)


if __name__ == "__main__":
    main()
