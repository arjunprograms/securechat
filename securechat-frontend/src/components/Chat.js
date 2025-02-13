import React, { useState, useEffect } from "react";

// The Chat component manages WebSocket communication and displays chat messages
const Chat = ({ username }) => {
    const [message, setMessage] = useState(""); // Stores the current message input
    const [messages, setMessages] = useState([]); // Stores chat history
    const [ws, setWs] = useState(null); // Stores WebSocket connection

    useEffect(() => {
        // Establish a WebSocket connection to the Python server
        const socket = new WebSocket("ws://localhost:8765");
        setWs(socket);

        // Listen for messages from the WebSocket server
        socket.onmessage = (event) => {
            const data = JSON.parse(event.data);
            if (data.type === "message") {
                setMessages((prev) => [...prev, data]); // Append new message to the list
            }
        };

        // Cleanup WebSocket connection when component unmounts
        return () => socket.close();
    }, []);

    // Function to send a chat message
    const sendMessage = () => {
        if (message.trim() !== "" && ws) {
            const data = JSON.stringify({ type: "message", username, message });
            ws.send(data);
            setMessage(""); // Clear input field after sending
        }
    };

    return (
        <div className="chat">
            <h2>Chat Room</h2>
            <div className="messages">
                {messages.map((msg, index) => (
                    <p key={index}>
                        <strong>{msg.username}:</strong> {msg.message}
                    </p>
                ))}
            </div>
            <input 
                type="text" 
                placeholder="Type a message" 
                value={message} 
                onChange={(e) => setMessage(e.target.value)}
            />
            <button onClick={sendMessage}>Send</button>
        </div>
    );
};

export default Chat;
