document.addEventListener("DOMContentLoaded", function() {
    const appointmentForm = document.getElementById("appointment-form");
    appointmentForm.addEventListener("submit", function(event) {
        event.preventDefault();
        const date = document.getElementById("date").value;
        const time = document.getElementById("time").value;
        const dateTime = `${date} ${time}:00`;
        const userId = localStorage.getItem("userId");
        if (!userId) {
            alert("Please log in first.");
            return;
        }
        const description = "Telemedicine Appointment";
        fetch("/api/appointments", {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({
                user_id: userId,
                date: dateTime,
                description: description
            })
        })
        .then(response => response.json())
        .then(data => {
            alert(data.message || "Appointment booked successfully!");
            appointmentForm.reset();
        })
        .catch(error => {
            alert("Error booking appointment.");
            console.error("Error booking appointment:", error);
        });
    });
});