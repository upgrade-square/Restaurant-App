# Restaurant CRM

A simple customer management system for restaurants.

## Project Structure

- `src/`: React frontend (Vite)
- `backend/`: Node.js Express backend
- `backend/data/customers.json`: JSON file storage for customer data

## How to Run

### 1. Setup

Make sure you have Node.js installed. Then, install dependencies for both frontend and backend:

```bash
# Install frontend dependencies
npm install

# Install backend dependencies
cd backend
npm install
```

### 2. Run Backend

In a separate terminal, start the backend server:

```bash
cd backend
npm run dev
```
The backend will run on `http://localhost:5001`.

### 3. Run Frontend

In another terminal, start the Vite dev server:

```bash
npm run dev
```
The frontend will run on `http://localhost:5173`.

## Features

- **Add Customer**: Name, Phone, and Purchase Amount.
- **Persistent Storage**: Data is saved to a JSON file on the server.
- **Delete Entries**: Remove customers from the list.
- **Date/Time Tracking**: Automatically logs when an entry was added.
- **Modern UI**: Responsive, clean design with dark mode support.
