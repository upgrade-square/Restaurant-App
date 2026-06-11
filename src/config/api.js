// src/config/api.js

/**
 * Centralized API configuration for MikrodCAP.
 * 
 * In Production: VITE_API_URL must be provided during build.
 * In Development: Falls back to http://localhost:5000.
 */
const API_URL = import.meta.env.VITE_API_URL || (import.meta.env.PROD ? window.location.origin : "http://localhost:5000");

export default API_URL;
