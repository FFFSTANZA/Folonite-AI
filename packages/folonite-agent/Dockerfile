# Base image
FROM node:20-alpine

# Create app directory
WORKDIR /app

# Copy app source
COPY ./shared ./shared
COPY ./folonite-agent/ ./folonite-agent/


# Install shared dependencies first
WORKDIR /app/shared
RUN npm install

WORKDIR /app/folonite-agent

# Install dependencies
RUN npm install


RUN npm run build

# Run the application
CMD ["npm", "run", "start:prod"] 


