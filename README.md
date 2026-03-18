# Timrapport-app för Vercel

## 1. Installera
npm install
npm run dev

## 2. Firebase
Fyll i src/firebase.js med din riktiga Firebase-konfiguration.

## 3. Firestore
Skapa samlingen users.
Dokument-id = användarens Firebase Auth UID.

Exempel admin:
{
  "name": "Robert Eklund",
  "email": "robbi@rhs.fi",
  "role": "admin"
}

Exempel worker:
{
  "name": "Arbetare 1",
  "email": "worker1@example.com",
  "role": "worker"
}

Samlingen entries skapas automatiskt av appen.

## 4. Authentication
Aktivera Email/Password i Firebase Authentication.

## 5. Deploy till Vercel
Framework preset: Vite
Build command: npm run build
Output directory: dist
