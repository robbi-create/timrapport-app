// Import the functions you need from the SDKs you need
import { initializeApp } from "firebase/app";
import { getAnalytics } from "firebase/analytics";
// TODO: Add SDKs for Firebase products that you want to use
// https://firebase.google.com/docs/web/setup#available-libraries

// Your web app's Firebase configuration
// For Firebase JS SDK v7.20.0 and later, measurementId is optional
const firebaseConfig = {
  apiKey: "AIzaSyB0PHDzJUhac_bwMAlwMd-AnxdcHZMQCMY",
  authDomain: "timrapport-app.firebaseapp.com",
  projectId: "timrapport-app",
  storageBucket: "timrapport-app.firebasestorage.app",
  messagingSenderId: "252622602578",
  appId: "1:252622602578:web:d3f7a8d5b558a98ff0fa8b",
  measurementId: "G-DHHLNPQTR8"
};

// Initialize Firebase
const app = initializeApp(firebaseConfig);
const analytics = getAnalytics(app);
