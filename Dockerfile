# 1. Use Node.js as the base
FROM node:20-slim

# 2. Install Python and FFmpeg (Required for yt-dlp)
RUN apt-get update && apt-get install -y \
    python3 \
    python3-pip \
    ffmpeg \
    curl \
    unzip \
    && rm -rf /var/lib/apt/lists/*

# 3. Set the working directory
WORKDIR /app

# 4. Copy package files and install dependencies
COPY package*.json ./
RUN npm install

# 5. Copy the rest of your app code
COPY . .

# 6. Build the React frontend
RUN npm run build

# 7. Expose the port
EXPOSE 3000

# 8. Start the server
CMD ["npm", "run", "dev"]