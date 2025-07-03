const form = document.getElementById('register-form');

form.addEventListener('submit', async (e) => {
  e.preventDefault();

  const data = {
    nome: form['nome'].value.trim(),
    cognome: form['cognome'].value.trim(),
    'data-nascita': form['data-nascita'].value,
    email: form['email'].value.trim(),
    'codice-fiscale': form['codice-fiscale'].value.trim(),
    telefono: form['telefono'].value.trim(),
    username: form['username'].value.trim(),
    password: form['password'].value
  };

  try {
    const res = await fetch('http://localhost:5000/register', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(data)
    });
    const json = await res.json();

    if (res.ok) {
      alert(json.message);
      form.reset();
    } else {
      alert(json.error || 'Errore nella registrazione.');
    }
  } catch (err) {
    alert('Errore di rete o server non raggiungibile.');
  }
});
