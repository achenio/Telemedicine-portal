document.addEventListener("DOMContentLoaded", function() {
    const form = document.getElementById("login-form");
    form.addEventListener("submit", function(event) {
        event.preventDefault();
        const username = document.getElementById("username").value;
        const password = document.getElementById("password").value;
        fetch("/api/login", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ username, password })
        })
        .then(res => res.json())
        .then(data => {
            if (data.user_id) {
                localStorage.setItem("userId", data.user_id);
                alert("Login successful!");
                window.location.href = "index.html";
            } else {
                alert(data.message || "Login failed.");
            }
        })
        .catch(() => alert("Error logging in."));
    });
});