import { initializeApp } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: "AIzaSyAD50euVgNkNU86bymHvI1eoVEOceEs7Ro",
  authDomain: "tts-ticket-system.firebaseapp.com",
  projectId: "tts-ticket-system",
  storageBucket: "tts-ticket-system.firebasestorage.app",
  messagingSenderId: "628783141508",
  appId: "1:628783141508:web:bdf331472b04b7b39728d1",
  measurementId: "G-2KLDW2RZ2M"
};

const app = initializeApp(firebaseConfig);
export const auth = getAuth(app);