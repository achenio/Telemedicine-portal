document.addEventListener("DOMContentLoaded", function() {
    const input = document.getElementById("ai-chat-input");
    const sendBtn = document.getElementById("send-ai-message");
    const messages = document.getElementById("ai-messages");

    function appendMessage(sender, text) {
        const div = document.createElement("div");
        div.className = "chat-message " + sender;
        div.textContent = text;
        messages.appendChild(div);
        messages.scrollTop = messages.scrollHeight;
    }

    sendBtn.addEventListener("click", sendMessage);
    input.addEventListener("keydown", function(e) {
        if (e.key === "Enter") sendMessage();
    });

    function sendMessage() {
        const text = input.value.trim();
        if (!text) return;
        appendMessage("user", text);
        input.value = "";
        fetch("/api/ai-chat", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ message: text })
        })
        .then(res => res.json())
        .then(data => {
            appendMessage("ai", data.reply || "No response from AI.");
        })
        .catch(() => appendMessage("ai", "Error contacting AI."));
    }
});