import axios from 'axios';
import { initializeApp, getApps } from 'firebase/app';
import { getAuth } from 'firebase/auth';

const firebaseConfig = {
  apiKey: process.env.NEXT_PUBLIC_FIREBASE_API_KEY || "AIzaSyDummyKeyForLocalDev",
  authDomain: "adgen-pharmacy.firebaseapp.com",
  projectId: "adgen-pharmacy",
  storageBucket: "adgen-pharmacy.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abcdef"
};

if (!getApps().length) {
  initializeApp(firebaseConfig);
}

export const auth = getAuth();

const getBaseUrl = () => {
  if (process.env.NEXT_PUBLIC_API_URL) {
    return process.env.NEXT_PUBLIC_API_URL;
  }
  if (typeof window !== 'undefined' && window.location.hostname.includes('vercel.app')) {
    return 'https://adgen-erp-backend.vercel.app/api';
  }
  return 'http://localhost:5000/api';
};

export const api = axios.create({
  baseURL: getBaseUrl(),
  headers: {
    'Content-Type': 'application/json',
  },
});

api.interceptors.request.use((config) => {
  if (typeof window !== 'undefined') {
    const token = localStorage.getItem('adgen_token');
    if (token) {
      config.headers.Authorization = `Bearer ${token}`;
    }
  }
  return config;
}, (error) => {
  return Promise.reject(error);
});
