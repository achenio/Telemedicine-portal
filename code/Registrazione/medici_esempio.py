import bcrypt
import random

specializzazioni = [
    "Cardiology", "Dermatology", "Endocrinology", "Gastroenterology", "General Surgery",
    "Gynecology", "Neurology", "Ophthalmology", "Orthopedics", "Otolaryngology (ENT)",
    "Pediatrics", "Psychiatry", "Pulmonology", "Radiology", "Urology",
    "Oncology", "Rheumatology", "Nephrology", "Hematology", "Infectious Diseases", "Other"
]

nomi = [
    "Alessandro", "Giulia", "Matteo", "Francesca", "Davide", "Sara", "Simone", "Martina", "Andrea", "Chiara",
    "Lorenzo", "Valentina", "Gabriele", "Federica", "Riccardo", "Elisa", "Stefano", "Alice", "Marco", "Ilaria",
    "Emanuele", "Silvia", "Nicola", "Roberta", "Fabio", "Laura", "Paolo", "Marta", "Enrico", "Beatrice"
]
cognomi = [
    "Rossi", "Bianchi", "Ferrari", "Russo", "Esposito", "Romano", "Colombo", "Ricci", "Marino", "Greco",
    "Bruno", "Gallo", "Conti", "DeLuca", "Mancini", "Costa", "Giordano", "Rizzo", "Lombardi", "Moretti",
    "Barbieri", "Fontana", "Santoro", "Mariani", "Rinaldi", "Caruso", "Ferrara", "Galli", "Martini", "Leone"
]
luoghi = ["Roma", "Milano", "Napoli", "Torino", "Palermo", "Genova", "Bologna", "Firenze", "Venezia", "Verona"]

def random_date():
    year = random.randint(1960, 1995)
    month = random.randint(1, 12)
    day = random.randint(1, 28)
    return f"{year}-{month:02d}-{day:02d}"

used = set()
for idx, spec in enumerate(specializzazioni):
    for i in range(3):
        while True:
            nome = random.choice(nomi)
            cognome = random.choice(cognomi)
            luogo = random.choice(luoghi)
            data = random_date()
            key = (nome, cognome, data)
            if key not in used:
                used.add(key)
                break
        codice_fiscale = f"{cognome[:3].upper()}{nome[:3].upper()}{str(idx+1).zfill(2)}{str(i+1)}A01H{str(idx+1).zfill(2)}U"
        email = f"{nome.lower()}.{cognome.lower()}_{idx+1}_{i+1}@clinic.com"
        telefono = f"333{str(idx+1).zfill(2)}{str(i+1).zfill(2)}{str(idx+1).zfill(2)}{str(i+1).zfill(2)}"
        username = f"{nome.lower()}{cognome.lower()}{idx+1}_{i+1}"
        pwd = f"{nome}{cognome}{data.replace('-', '')}".lower()
        hash_pwd = bcrypt.hashpw(pwd.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        print(
            f"INSERT INTO utenti (nome, cognome, codice_fiscale, luogo_nascita, data_nascita, email, telefono, username, password_hash, user_type, specialization) "
            f"VALUES ('{nome}', '{cognome}', '{codice_fiscale}', '{luogo}', '{data}', '{email}', '{telefono}', '{username}', '{hash_pwd}', 'doctor', '{spec}');"
        )

# Esempio di utilizzo di check_password_hash
# check_password_hash(password_hash, password_inserita)