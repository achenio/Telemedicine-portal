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

def generate_specialties(main_specialization):
    specialties_dict = {
        "Cardiology": ["Arrhythmia", "Heart Failure", "Hypertension", "Coronary Artery Disease", "Valvular Heart Disease"],
        "Dermatology": ["Psoriasis", "Acne", "Eczema", "Skin Cancer", "Rosacea"],
        "Endocrinology": ["Diabetes", "Thyroid Disorders", "Osteoporosis", "Adrenal Disorders", "Pituitary Disorders"],
        "Gastroenterology": ["IBS", "Crohn's Disease", "Ulcerative Colitis", "Liver Disease", "GERD"],
        "General Surgery": ["Appendectomy", "Gallbladder Surgery", "Hernia Repair", "Breast Surgery", "Colorectal Surgery"],
        "Gynecology": ["Endometriosis", "PCOS", "Menstrual Disorders", "Gynecologic Oncology", "Infertility"],
        "Neurology": ["Epilepsy", "Stroke", "Multiple Sclerosis", "Parkinson's Disease", "Migraine"],
        "Ophthalmology": ["Glaucoma", "Cataract", "Retinal Disorders", "Corneal Disease", "Diabetic Retinopathy"],
        "Orthopedics": ["Arthritis", "Fractures", "Sports Injuries", "Spine Disorders", "Joint Replacement"],
        "Otolaryngology (ENT)": ["Sinusitis", "Hearing Loss", "Sleep Apnea", "Thyroid Surgery", "Head & Neck Cancer"],
        "Pediatrics": ["Asthma", "ADHD", "Childhood Obesity", "Infectious Diseases", "Developmental Disorders"],
        "Psychiatry": ["Depression", "Anxiety Disorders", "Bipolar Disorder", "Schizophrenia", "PTSD"],
        "Pulmonology": ["COPD", "Asthma", "Pulmonary Fibrosis", "Sleep Disorders", "Lung Cancer"],
        "Radiology": ["MRI", "CT Scan", "Ultrasound", "Interventional Radiology", "Mammography"],
        "Urology": ["Kidney Stones", "Prostate Cancer", "Urinary Incontinence", "Male Infertility", "Bladder Cancer"],
        "Oncology": ["Breast Cancer", "Lung Cancer", "Colorectal Cancer", "Leukemia", "Lymphoma"],
        "Rheumatology": ["Rheumatoid Arthritis", "Lupus", "Gout", "Osteoarthritis", "Vasculitis"],
        "Nephrology": ["Chronic Kidney Disease", "Dialysis", "Hypertension", "Glomerulonephritis", "Kidney Transplant"],
        "Hematology": ["Anemia", "Leukemia", "Lymphoma", "Hemophilia", "Thrombosis"],
        "Infectious Diseases": ["HIV/AIDS", "Tuberculosis", "Hepatitis", "COVID-19", "Malaria"],
        "Other": ["General Medicine", "Preventive Care", "Health Promotion", "Medical Education", "Clinical Research"]
    }
    options = specialties_dict.get(main_specialization, specialties_dict["Other"])
    return random.sample(options, 3)

def generate_bio(nome, cognome, main_specialization, specialties):
    return (
        f"Dr. {nome} {cognome} is a specialist in {main_specialization} with expertise in {', '.join(specialties)}. "
        f"With years of experience, Dr. {cognome} is dedicated to providing high-quality care and personalized treatment for every patient."
    )

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
        telefono = f"333{random.randint(1000000, 9999999)}"
        username = f"{nome.lower()}{cognome.lower()}{idx+1}_{i+1}"
        pwd = f"{nome}{cognome}{data.replace('-', '')}".lower()
        hash_pwd = bcrypt.hashpw(pwd.encode('utf-8'), bcrypt.gensalt()).decode('utf-8')
        specialties = generate_specialties(spec)
        bio = generate_bio(nome, cognome, spec, specialties)
        specialties_str = ', '.join(specialties)
        rating = round(random.uniform(3.5, 5.0), 1)
        print(
            f"INSERT INTO utenti (nome, cognome, codice_fiscale, luogo_nascita, data_nascita, email, telefono, username, password_hash, user_type, specialization, bio, specialties, rating) "
            f"VALUES ('{nome}', '{cognome}', '{codice_fiscale}', '{luogo}', '{data}', '{email}', '{telefono}', '{username}', '{hash_pwd}', 'doctor', '{spec}', \"{bio}\", \"{specialties_str}\", {rating});"
        )

# Esempio di utilizzo di check_password_hash
# check_password_hash(password_hash, password_inserita)