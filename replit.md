# StingHive Muay Thai Backend

## Overview
This is a Node.js Express backend API for the StingHive Muay Thai booking system. It provides endpoints for:
- User authentication (login/register)
- Class schedule management
- Booking management
- Dashboard data
- User management

## Project Structure
- `server.js` - Main entry point
- `config/` - Database configuration
- `controllers/` - Route handlers
- `models/` - Sequelize database models
- `routes/` - Express route definitions
- `services/` - Business logic layer
- `middlewares/` - Authentication middleware
- `utils/` - Utility functions (email service)
- `templates/` - Email templates

## Environment
- Node.js with Express
- PostgreSQL database (Sequelize ORM)
- Port: 5000

## API Endpoints
- `/api/v1/auth` - Authentication routes
- `/api/v1/users` - User CRUD routes
- `/api/v1/schedules` - Class schedule routes
- `/api/v1/bookings` - Booking routes
- `/api/v1/dashboard` - Dashboard routes

## Running the Server
```bash
npm run start    # Production
npm run dev      # Development with nodemon
```
