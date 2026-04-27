// js/firebase-config.js
import { initializeApp } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-app.js";
import { getAuth, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-auth.js";
import { getFirestore } from "https://www.gstatic.com/firebasejs/10.8.0/firebase-firestore.js";

const firebaseConfig = {
  apiKey: "AIzaSyAQJT1bqaaoEf-FnffHDeVLKEGbMpJJzcM",
  authDomain: "pet-shop-noga1.firebaseapp.com",
  projectId: "pet-shop-noga1",
  storageBucket: "pet-shop-noga1.firebasestorage.app",
  messagingSenderId: "735321499822",
  appId: "1:735321499822:web:414e29965262b14d47a53f",
  measurementId: "G-MYBMZSZ8C4"
};



const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);
export const db = getFirestore(app);
export { onAuthStateChanged };