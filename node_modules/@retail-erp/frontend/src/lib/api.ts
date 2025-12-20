import axios from 'axios';

export const api = axios.create({
  baseURL: '/api',
  headers: { 'Content-Type': 'application/json' },
});

// Request interceptor - add auth token
api.interceptors.request.use((config) => {
  const storage = localStorage.getItem('auth-storage');
  if (storage) {
    const { state } = JSON.parse(storage);
    if (state?.accessToken) {
      config.headers.Authorization = `Bearer ${state.accessToken}`;
    }
  }
  return config;
});

// Response interceptor - handle errors
api.interceptors.response.use(
  (response) => response,
  async (error) => {
    if (error.response?.status === 401) {
      localStorage.removeItem('auth-storage');
      window.location.href = '/login';
    }
    return Promise.reject(error);
  }
);

export default api;
