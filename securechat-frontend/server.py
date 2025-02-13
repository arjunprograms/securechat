import asyncio  # Handles asynchronous operations
import websockets  # WebSockets library for real-time communication
import json  # Handles JSON data
import time  # Tracks message timing for rate limiting
import sys  # Used to check platform

# Dictionary to store connected users (username → WebSocket connection)
users = {}

# Simulated user database for authentication (Replace with a real database in production)
USER_CRED = {"arjun": "password123", "ashok": "password456"}

# Dictionary to track when users last sent a message (for rate limiting)
user_last_message_time = {}

async def handle_client(websocket, path):
    """
    Handles incoming WebSocket connections, processes login requests, 
    and manages message sending and broadcasting.
    """
    try:
        async for message in websocket:
            data = json.loads(message)  # Convert received JSON string to a Python dictionary

            # Handle Login Requests
            if data.get("type") == "login":
                username = data["username"]
                password = data["password"]

                if USER_CRED.get(username) == password:  # Check credentials
                    users[username] = websocket  # Store user's WebSocket connection
                    websocket.username = username  # Assign username to WebSocket connection
                    await websocket.send(json.dumps({"type": "login_success", "message": "Login successful"}))
                else:
                    await websocket.send(json.dumps({"type": "login_failed", "message": "Invalid Credentials"}))

            # Handle Chat Messages
            elif data.get("type") == "message":  # Fixed: Changed from "messages" to "message"
                username = data["username"]
                msg = data["message"]

                # Implement rate limiting (1 message per second)
                current_time = time.time()
                if username in user_last_message_time and current_time - user_last_message_time[username] < 1:
                    await websocket.send(json.dumps({"type": "error", "message": "Rate limit exceeded, 1 message per second"}))
                    continue

                user_last_message_time[username] = current_time  # Update last message time

                print(f"{username}: {msg}")  # Print message on the server

                # Broadcast the message to all connected users
                for user, conn in users.items():  # Fixed: Changed `items()` from `item()`
                    if conn != websocket:  # Don't send the message back to the sender
                        await conn.send(json.dumps({"type": "message", "username": username, "message": msg}))

    except websockets.exceptions.ConnectionClosed:
        print(f"Client {websocket.username} disconnected")
        users.pop(websocket.username, None)  # Remove user from the connected list

async def main():
    """
    Starts the WebSocket server and keeps it running.
    """
    server = await websockets.serve(handle_client, "localhost", 8765)
    print("WebSocket server running on ws://localhost:8765")
    await server.wait_closed()  # Keep server running indefinitely

# Ensure compatibility with Windows async event loops
if sys.platform.startswith('win'):
    asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())

# Run the WebSocket server using asyncio.run()
if __name__ == "__main__":
    asyncio.run(main())  # Properly initializes the async event loop
