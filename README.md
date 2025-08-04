`This was an initial README template meant for a partner. Updating soon...`

# Transport Buddy

Transport Buddy is a full-stack application that consists of a React frontend and an Express backend.

## Project Structure

```
Transport_buddy
├── backend                # Express backend
│   ├── src
│   │   ├── app.ts         # Entry point for the Express server
│   │   └── routes
│   │       └── index.ts   # API routes for the Express server
│   ├── package.json       # Server-side dependencies and scripts
│   └── tsconfig.json      # TypeScript configuration for the server
├── frontend               # React frontend
│   ├── public
│   │   └── index.html     # Main HTML file for the React app
│   ├── src
│   │   ├── App.tsx        # Main App component
│   │   ├── index.tsx      # Entry point for the React application
│   │   └── components
│   │       └── HelloPage
│   │       │  ├── HelloPage.css
│   │       │  └── HelloPage.tsx   # Only displays hello world, for now 
│   │       └── Loader
│   │           └── Loader.tsx     # Basic Loading animation
│   │       └── MapPage
│   │           ├── MapPage.css
│   │           └── MapPage.tsx    # For now, just for Geolocation API testing
│   ├── package.json       # Client-side dependencies and scripts
│   └── tsconfig.json      # TypeScript configuration for the client
└── README.md              # This documentation
```

### Prerequisites

- Node.js
- npm (Node package manager)
- Docker Desktop
- MongoDB community edition

#### For testing Api:
- Postman application, wget or curl (any of them should work depending on the location of test)

### Local Installation (also first time)

1. Clone the repository:

   ```
   git clone https://github.com/Transport-Buddies/TransportBuddy
   cd Transport_buddy
   ```

2. Install the client dependencies:

   ```
   cd frontend
   npm install
   ```

3. Install the server dependencies:

   ```
   cd ../backend
   npm install
   ```

### Locally Running the Application

1. Start the Express server (important to start the backend server first):

   ```
   cd backend
   npm run dev
   ```

2. In a new terminal, start the React application:

   ```
   cd client
   npm start
   ```

3. Open your browser and navigate to `http://localhost:3000` to view the application.

### Using Docker Compose

1. Make sure docker desktop is running.

2. Build and start the containers:

   ```
   docker-compose up --build
   ```

3. Once the containers are running, the backend will be accessible at `http://localhost:5000` and the frontend at `http://localhost:3000`.

4. To stop the containers, run:

   ```
   docker-compose down
   ```

* Incase you wanna delete corrupted cache or free up space (will sadly happen often):
   ```
   docker builder prune --force
   ```
* For logs:

   ```
   docker-compose logs
   ```

## Usage

So far, only displays a simple "Hello, World!" message on the client-side.
