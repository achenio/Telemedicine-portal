document.addEventListener("DOMContentLoaded", function() {
    const list = document.getElementById("appointments-list");
    const userId = localStorage.getItem("userId");
    if (!userId) {
        list.innerHTML = "<li>Please log in to see your bookings.</li>";
        return;
    }
    fetch(`/api/appointments?user_id=${userId}`)
        .then(res => res.json())
        .then(data => {
            list.innerHTML = "";
            (data.appointments || []).forEach(app => {
                const li = document.createElement("li");
                li.textContent = `${app.date} - ${app.description}`;
                list.appendChild(li);
            });
        })
        .catch(() => {
            list.innerHTML = "<li>Error loading appointments.</li>";
        });
});