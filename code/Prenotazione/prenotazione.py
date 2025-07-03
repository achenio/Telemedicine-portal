import sqlite3
conn = sqlite3.connect('prenotazioni.db')
cursor = conn.cursor()
cursor.execute('''
    CREATE TABLE IF NOT EXISTS prenotazioni (
               id INTEGER PRIMARY KEY AUTOINCREMENT,
               data TEXT NOT NULL,
               ora TEXT NOT NULL
               ) ''')
data = input("Inserisci la data della prenotazione (YYYY-MM-DD): ")
ora = input("Inserisci l'ora della prenotazione (HH:MM): ")

cursor.execute('''
    INSERT INTO prenotazioni (data, ora)
    VALUES (?, ?)
''', (data, ora))
print("\n Elenco delle prenotazioni:")

cursor.execute('SELECT * FROM prenotazioni')
prenotazioni = cursor.fetchall()
for prenotazione in prenotazioni:
    print(f"ID: {prenotazione[0]}, Data: {prenotazione[1]}, Ora: {prenotazione[2]}")

conn.commit()
conn.close()