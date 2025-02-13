import React, { useState } from "react";
import Login from "./components/Login";
import Chat from "./components/Chat";

// The main App component manages login state and renders Login or Chat component
function App() {
    const [username, setUsername] = useState(""); // Stores logged-in username
    const [isAuthenticated, setIsAuthenticated] = useState(false); // Tracks login state

    // Handles login by verifying user and updating state
    const handleLogin = (username, password) => {
        // Simulate a login request to the WebSocket server
        const socket = new WebSocket("ws://localhost:8765");
        socket.onopen = () => {
            const loginRequest = JSON.stringify({ type: "login", username, password });
            socket.send(loginRequest);
        };

        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "login_success") {
                setUsername(username);
                setIsAuthenticated(true);
            } else {
                alert("Login failed. Please check your credentials.");
            }
        };
    };

    return (
        <div className="chat-container">
            {!isAuthenticated ? <Login onLogin={handleLogin} /> : <Chat username={username} />}
        </div>
    );
}

export default App;
