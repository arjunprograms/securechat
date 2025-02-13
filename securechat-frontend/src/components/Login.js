import React, { useState } from "react";

// The Login component manages user login and authentication
const Login = ({ onLogin }) => {
    const [username, setUsername] = useState(""); // State to store entered username
    const [password, setPassword] = useState(""); // State to store entered password

    // Function to handle login when the button is clicked
    const handleLogin = () => {
        if (username.trim() && password.trim()) {
            onLogin(username, password); // Calls the function passed from App.js
        } else {
            alert("Please enter a username and password.");
        }
    };

    return (
        <div className="login">
            <h2>SecureChat Login</h2>
            <input 
                type="text" 
                placeholder="Username" 
                value={username} 
                onChange={(e) => setUsername(e.target.value)}
            />
            <input 
                type="password" 
                placeholder="Password" 
                value={password} 
                onChange={(e) => setPassword(e.target.value)}
            />
            <button onClick={handleLogin}>Login</button>
        </div>
    );
};

export default Login;
