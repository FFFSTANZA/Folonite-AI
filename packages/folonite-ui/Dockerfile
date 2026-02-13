# Base image
FROM node:20-alpine

# Declare build arguments
ARG FOLONITE_AGENT_BASE_URL
ARG FOLONITE_DESKTOP_VNC_URL

# Set environment variables for the build process
ENV FOLONITE_AGENT_BASE_URL=${FOLONITE_AGENT_BASE_URL}
ENV FOLONITE_DESKTOP_VNC_URL=${FOLONITE_DESKTOP_VNC_URL}

# Create app directory
WORKDIR /app

# Copy app source
COPY ./shared ./shared
COPY ./folonite-ui/ ./folonite-ui

# Install shared dependencies first
WORKDIR /app/shared
RUN npm install

WORKDIR /app/folonite-ui

# Install dependencies
RUN npm install

RUN npm run build

# Run the application
CMD ["npm", "run", "start"] 


