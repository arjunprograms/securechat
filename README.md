SecureChat: A Secure Real-Time Chat Application
Overview:
SecureChat is a secure, real-time chat application designed to demonstrate key principles in web security and live communication. The application enables users to register, log in, and exchange messages instantly. Although a file sharing feature is intended for future updates, this version focuses on real-time messaging powered by WebSocket technology.

Project Structure:

The project is divided into two main parts: the client and the server.
The client is implemented as a single HTML file, which provides the user interface for registration, login, and the chat room.
The server uses Node.js with Express to manage HTTP requests for user registration, login, and file uploads. It also runs a WebSocket server to facilitate real-time communication between connected clients.
Uploaded files are stored in an "uploads" folder on the server, although file sharing is still under development.
Core Functionality:

User Registration & Login:
Users create an account by entering a unique username and password. Once registered, users can log in, which triggers a POST request to the server. After successful authentication, the chat interface is displayed and a WebSocket connection is established.

Real-Time Messaging with WebSocket:
The backbone of SecureChat is its WebSocket implementation. Once a user logs in, the client initiates a WebSocket connection to the server on port 3001. The connection is used for:

Authentication: Upon connection, the client sends an authentication message (including the username and password) to the server. This verifies the user's identity for the WebSocket session.
Message Exchange: Users send text messages through the WebSocket. The server receives these messages, appends additional data such as a timestamp, and broadcasts them to all connected clients.
Reconnection Logic: In case of a connection drop, the client implements a reconnection mechanism that attempts to restore the WebSocket connection using the stored credentials. This ensures minimal disruption to the user session during temporary network issues.
File Sharing (Work in Progress):
Although the interface includes an option for file uploads (via a paperclip icon), the file sharing functionality is still being refined. The server uses the Formidable library to handle file uploads, storing files in the "uploads" directory. Future updates will allow these files to be shared as downloadable links within the chat.

Technical Insights on WebSocket:

Establishing the Connection: The client opens a WebSocket connection immediately after login. Once connected, the client sends an "auth" message to verify the user.
Maintaining the Session: The server continuously monitors active WebSocket connections. Every incoming message is parsed and, if it is a valid text or file message, it is broadcast to every client.
Handling Disconnections: If the WebSocket connection is lost, the client waits and periodically checks for reconnection without forcing an immediate logout. This design minimizes interruptions and maintains the user session even during transient network problems.
Message Structure: Each message transmitted over the WebSocket includes the type (e.g., "message" or "file"), the sender's username, the content (or file metadata), and a timestamp. This structure ensures that all clients can render messages consistently.
Installation and Setup (Described in Plain Text):

Clone the Repository:
First, clone the project repository from GitHub. Then, navigate to the project folder on your local machine.

Server Setup:
In the server directory, install the required Node.js packages using the npm package manager. This will install dependencies such as Express, ws (WebSocket library), Formidable, and Cors.

Client Setup:
The client consists of a single HTML file. No additional installation is required for the client.

Running the Application:
Start the server (which listens on port 3001) using the npm start command. Then, open the HTML file from the client folder in your web browser to use the chat application.

Usage Instructions:

Registering and Logging In:
When you first open the application, use the registration form to create an account. After successful registration, log in using your chosen credentials.
Messaging:
Once logged in, you can send text messages using the chat interface. Your messages will appear in real time along with the sender’s username and a timestamp.
File Sharing:
While a file upload option is visible, this feature is still being improved. Current efforts are focused on ensuring robust file handling without interrupting the WebSocket connection.
Troubleshooting:

If you experience disconnections, verify that the server is running and accessible on port 3001.
Ensure that your credentials are entered correctly during login.
For any file upload issues, remember that the feature is experimental and may require further refinement.
Contact:
For additional information or any queries related to SecureChat, please contact:
Email: arjun.subedischool@gmail.com
GitHub: arjunprograms

