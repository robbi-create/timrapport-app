import { initializeApp, getApps } from "firebase/app";
import { getAuth } from "firebase/auth";
import { getFirestore } from "firebase/firestore";

const firebaseConfig = {
  apiKey: "AIzaSyB0PHDzJUhac_bwMAlwMd-AnxdcHZMQCMY",
  authDomain: "timrapport-app.firebaseapp.com",
  projectId: "timrapport-app",
  storageBucket: "timrapport-app.firebasestorage.app",
  messagingSenderId: "252622602578",
  appId: "1:252622602578:web:d3f7a8d5b558a98ff0fa8b"
};

// Init
const app = getApps().length ? getApps()[0] : initializeApp(firebaseConfig);

// Exportera det appen behöver
export const auth = getAuth(app);
export const db = getFirestore(app);
